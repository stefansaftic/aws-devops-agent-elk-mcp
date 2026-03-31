# AWS Deployment Guide — ELK MCP Server for DevOps Agent

## Architecture Overview

```
Your Mac (deploy.sh)                        AWS (us-east-1)
────────────────────                        ────────────────
1. Build Docker images ──push──►  ECR (3 repos: ES, MCP, Demo)
2. Bundle docker-compose ─upload─► S3 Bucket
3. Deploy CloudFormation ─────►   VPC + EC2 + NLB + API GW

                          ┌──────────────────────────────────────────────────────┐
                          │                    AWS (us-east-1)                   │
                          │                                                      │
DevOps Agent ──HTTPS──►   │  ┌─────────────┐    ┌──────────┐    ┌────────────┐  │
                          │  │ API Gateway  │───►│ VPC Link │───►│    NLB     │  │
Browser ──────HTTPS──►    │  │ (HTTP API)   │    │          │    │ (internal) │  │
                          │  └──────┬───────┘    └──────────┘    └─────┬──────┘  │
                          │         │                                   │         │
                          │         │ /instance/*                      │ :3000   │
                          │         ▼                                   │ :3001   │
                          │  ┌─────────────┐                    ┌──────▼──────┐  │
                          │  │   Lambda     │──ec2:Start───►    │   EC2       │  │
                          │  │ (start/stop) │                   │ (private)   │  │
                          │  └─────────────┘                    │             │  │
                          │                                      │ Pulls from: │  │
                          │  ┌─────────┐  ┌──────┐              │ ├─ ECR ✅   │  │
                          │  │   ECR   │  │  S3  │──────────►   │ ├─ S3  ✅   │  │
                          │  │ (images)│  │(code)│  VPC Endpts  │ └─ No 🌐   │  │
                          │  └─────────┘  └──────┘              └─────────────┘  │
                          │                                                      │
                          │  VPC: 10.0.0.0/16 (private subnets only)             │
                          │  VPC Endpoints: SSM, ECR, S3, EC2 (no NAT Gateway)   │
                          └──────────────────────────────────────────────────────┘
```

## How Code Gets to EC2 (No Internet Access)

The EC2 instance is in a **private subnet with no internet access** (no NAT Gateway). Instead:

| What | Source | How |
|------|--------|-----|
| Docker images (ES, MCP, Demo) | **ECR** | Via `ecr.api` + `ecr.dkr` VPC endpoints |
| Docker image layers | **S3** | Via S3 Gateway VPC endpoint (ECR stores layers in S3) |
| docker-compose.ec2.yml | **S3 bucket** | Via S3 Gateway VPC endpoint |
| Docker Compose binary | **S3 bucket** | Via S3 Gateway VPC endpoint |
| Self-shutdown (ec2:StopInstances) | **EC2 API** | Via `ec2` VPC endpoint |
| SSM Session Manager | **SSM** | Via `ssm` + `ssmmessages` + `ec2messages` VPC endpoints |

**deploy.sh does all the heavy lifting from your Mac:**
1. Builds Docker images locally (including cross-compile for linux/amd64)
2. Pushes all 3 images to ECR (~1.5GB total)
3. Uploads docker-compose.ec2.yml + Docker Compose binary to S3
4. EC2 UserData pulls everything from ECR/S3 on boot

## VPC Endpoints (7 total — replaces NAT Gateway)

| Endpoint | Type | Purpose |
|----------|------|---------|
| `ssm` | Interface | SSM Session Manager |
| `ssmmessages` | Interface | SSM Session Manager |
| `ec2messages` | Interface | SSM Session Manager |
| `ecr.api` | Interface | ECR API calls |
| `ecr.dkr` | Interface | Docker image pulls |
| `ec2` | Interface | Self-shutdown (ec2:StopInstances) |
| `s3` | Gateway | ECR layers + code bundle + Docker Compose binary |

## Deployment Steps

### Prerequisites
- AWS CLI configured (`aws configure`)
- Docker running locally
- `jq` installed (`brew install jq`)

### Deploy (One Command)

```bash
./deploy/deploy.sh
```

This runs 4 steps automatically:
1. **CloudFormation** → Creates VPC, EC2, NLB, API GW, ECR repos, S3 bucket (~5-8 min)
2. **Build & Push** → Builds images locally, pushes to ECR (~3-5 min)
3. **Upload Bundle** → docker-compose.ec2.yml + Docker Compose binary → S3
4. **EC2 Boots** → Pulls from ECR/S3, starts Docker Compose (~3-5 min)

**Total: ~12-18 minutes first deploy**

### Environment Variables

```bash
# Override defaults:
STACK_NAME=my-elk-demo \
AWS_REGION=us-west-2 \
OAUTH_CLIENT_SECRET=my-secret \
AUTO_SHUTDOWN_MINUTES=60 \
ES_VERSION=8.17.0 \
./deploy/deploy.sh
```

### Teardown ($0/day)

```bash
./deploy/teardown.sh
# Empties S3, cleans ECR images, deletes CloudFormation stack
```

## Cost Breakdown

### When Running (~$1.70/day)

| Resource | Cost/day |
|----------|----------|
| EC2 t3.medium | ~$1.00 |
| NLB | ~$0.60 |
| EBS 30GB gp3 | ~$0.07 |
| VPC Endpoints (6x Interface) | ~$0.03 |
| API Gateway | Free tier |
| Lambda | Free tier |
| ECR storage (~1.5GB) | ~$0.00 |
| S3 storage (~50MB) | ~$0.00 |
| **Total** | **~$1.70/day** |

### When Stopped (~$0.70/day)

| Resource | Cost/day |
|----------|----------|
| EC2 | $0.00 (stopped) |
| NLB | ~$0.60 |
| EBS + VPC Endpoints | ~$0.10 |
| **Total** | **~$0.70/day** |

### Full Teardown ($0/day)

```bash
./deploy/teardown.sh
```

## File Structure

```
deploy/
├── DEPLOYMENT.md           # This document
├── template.yaml           # CloudFormation (VPC, EC2, NLB, API GW, ECR, S3, Lambda)
├── deploy.sh               # Build → Push → Upload → Deploy
└── teardown.sh             # Clean ECR/S3 → Delete stack

docker-compose.ec2.yml      # EC2 version (uses ECR images, no build)
docker-compose.yml           # Local version (builds from source)
```

## Instance Management

```bash
# Via API (works even when EC2 is stopped — Lambda handles it):
curl -X POST https://<api-url>/instance/start
curl -X POST https://<api-url>/instance/stop
curl https://<api-url>/instance/status

# Via AWS CLI:
aws ec2 start-instances --instance-ids <instance-id>
aws ec2 stop-instances --instance-ids <instance-id>

# Via SSM Session Manager (shell access):
aws ssm start-session --target <instance-id> --region us-east-1
```

## DevOps Agent Registration

| Setting | Value |
|---------|-------|
| **Name** | `ELK Search` |
| **Endpoint URL** | `https://<api-gw-url>/mcp` |
| **Description** | Elasticsearch log and metric search for incident investigation |
| **Auth Method** | OAuth Client Credentials |
| **Client ID** | `devops-agent` |
| **Client Secret** | (from deploy.sh output) |
| **Exchange URL** | `https://<api-gw-url>/oauth/token` |
| **Scopes** | `mcp:read` |

**Allowlist tools**: `search`, `list_indices`, `get_mappings`

## Demo Dashboard

The dashboard at `https://<api-url>/dashboard/` automatically detects EC2 mode:

| Feature | Local Mode | EC2 Mode |
|---------|-----------|----------|
| Scenario triggers | ✅ | ✅ |
| Mode badge | 💻 Local | ☁️ EC2 |
| Shutdown timer | Hidden | ✅ Countdown display |
| Extend +1h button | Hidden | ✅ |
| Shutdown Now button | Hidden | ✅ |

## Auto-Shutdown

- Default: **2 hours** after boot (configurable via `AUTO_SHUTDOWN_MINUTES`)
- Dashboard shows live countdown
- "Extend +1h" button adds 60 minutes
- On reboot, timer resets to configured duration
- Uses `at` scheduler + EC2 API via VPC endpoint

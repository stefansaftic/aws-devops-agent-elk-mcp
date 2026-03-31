# 🔍 ELK Stack MCP Server for AWS DevOps Agent

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-blue)](https://modelcontextprotocol.io)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.x-005571)](https://www.elastic.co/elasticsearch)

A custom **MCP (Model Context Protocol)** server that connects [AWS DevOps Agent](https://aws.amazon.com/devops-agent/) to **Elasticsearch/OpenSearch** for log and metric investigation. Includes a demo service with web-triggered error scenarios for testing the DevOps Agent investigation flow.

> **Use Case:** Give your AWS DevOps Agent the ability to search logs, inspect indices, and investigate incidents stored in your ELK stack — all through natural language.

---

## 📐 Architecture

```
┌─────────────────────┐                          ┌─────────────────────────┐
│  AWS DevOps Agent   │         HTTPS            │  Your Infrastructure    │
│  (Agent Space)      │ ◄──────────────────────► │                         │
└─────────────────────┘                          │  ┌───────────────────┐  │
                                                 │  │ MCP Server        │  │
                                                 │  │ + OAuth 2.0       │  │
                                                 │  │ :3000             │  │
                                                 │  └────────┬──────────┘  │
                                                 │           │ :9200       │
                                                 │  ┌────────▼──────────┐  │
                                                 │  │ Elasticsearch 8.x │  │
                                                 │  └────────▲──────────┘  │
                                                 │           │             │
                                                 │  ┌────────┴──────────┐  │
                                                 │  │ Demo Service      │  │
                                                 │  │ :3001 (Web UI)    │  │
                                                 │  └───────────────────┘  │
                                                 └─────────────────────────┘
```

## 🧩 Components

| Component | Port | Description |
|-----------|------|-------------|
| **MCP Server** | 3000 | Streamable HTTP MCP server with OAuth 2.0 authentication |
| **Demo Service** | 3001 | Web dashboard to trigger error scenarios + continuous log generator |
| **Elasticsearch** | 9200 | Single-node Elasticsearch 8.x cluster |

## 🛠️ MCP Tools

The MCP server exposes three tools that AWS DevOps Agent can use:

| Tool | Description |
|------|-------------|
| `search` | Search logs/data with Elasticsearch query DSL or simple query string, time ranges, index patterns, and aggregations |
| `list_indices` | List available Elasticsearch indices with document counts and health status |
| `get_mappings` | Get field mappings for a specific index to understand data structure |

---

## 🚀 Quick Start (Local)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### 1. Clone and Configure

```bash
git clone https://github.com/stefansaftic/aws-devops-agent-elk-mcp.git
cd aws-devops-agent-elk-mcp

# Copy and edit environment variables
cp .env.example .env
# Edit .env — set your own OAUTH_CLIENT_SECRET and JWT_SECRET
```

### 2. Start the Stack

```bash
docker compose up -d
```

This starts Elasticsearch, the MCP Server, and the Demo Service. Wait ~30 seconds for Elasticsearch to initialize.

### 3. Verify Everything is Running

```bash
# Check MCP server health
curl http://localhost:3000/health

# Check demo service
curl http://localhost:3001/health

# Open the demo dashboard
open http://localhost:3001
```

### 4. Stop the Stack

```bash
./scripts/stop.sh
```

---

## ☁️ AWS EC2 Deployment

For a production-ready deployment on AWS, use the included CloudFormation-based deployment. This creates a fully private EC2 instance behind API Gateway — no NAT Gateway needed.

See the **[AWS Deployment Guide](deploy/DEPLOYMENT.md)** for full details.

```bash
# Deploy to AWS (~15 min)
./deploy/deploy.sh

# Tear down ($0/day)
./deploy/teardown.sh
```

The `deploy/` directory contains:
- **`template.yaml`** — CloudFormation template (VPC, EC2, NLB, API Gateway, ECR, S3, Lambda)
- **`deploy.sh`** — One-command deployment: builds images, pushes to ECR, deploys stack
- **`teardown.sh`** — Clean teardown of all AWS resources

Once deployed, the API Gateway provides a public HTTPS endpoint for the MCP server.

### 💰 AWS Cost Estimate

| State | Cost | Notes |
|-------|------|-------|
| **Running** | ~$1.70/day | EC2 t3.medium + NLB + VPC endpoints |
| **Stopped** | ~$0.70/day | NLB + EBS (EC2 auto-stops after 2h) |
| **Torn down** | $0/day | `./deploy/teardown.sh` removes everything |

> Built-in auto-shutdown stops the EC2 instance after 2 hours to minimize costs. See the [full cost breakdown](deploy/DEPLOYMENT.md#cost-breakdown) in the deployment guide.

---

## 🔗 Register in AWS DevOps Agent

### Step 1: Add the MCP Server (Account Level)

1. Sign in to the **AWS Management Console**
2. Navigate to **AWS DevOps Agent** console
3. Go to the **Capabilities** tab → **MCP Servers** → **Add**
4. Enter:

| Field | Value |
|-------|-------|
| **Name** | `ELK Search` |
| **Endpoint URL** | `https://<your-endpoint>/mcp` |
| **Description** | Elasticsearch/OpenSearch log and metric search for incident investigation |

### Step 2: Configure OAuth Authentication

Select **OAuth Client Credentials** and configure:

| Field | Value |
|-------|-------|
| **Client ID** | `devops-agent` (or your custom value from `.env`) |
| **Client Secret** | Your secret from `.env` |
| **Exchange URL** | `https://<your-endpoint>/oauth/token` |
| **Scope** | `mcp:read` |

### Step 3: Configure Agent Space

1. Select your **Agent Space** → **Capabilities** → **MCP Servers** → **Add**
2. Select the `ELK Search` MCP server
3. Choose **Select specific tools** and allowlist:
   - `search`
   - `list_indices`
   - `get_mappings`

---

## 🎭 Demo Scenarios

The demo service generates continuous baseline logs (app logs, access logs, system metrics) and lets you trigger realistic error scenarios to investigate with DevOps Agent.

### Trigger via Web Dashboard

Open the demo dashboard and click any scenario button:

| Scenario | Duration | What it Generates |
|----------|----------|-------------------|
| 🔴 **Database Connection Timeout** | 2 min | Connection pool exhaustion, SQL timeout errors |
| 🟡 **Memory Pressure / OOM** | 3 min | OOM kills, GC pauses, heap exhaustion |
| 🔴 **5xx Error Spike** | 1 min | Burst of 500/502/503 HTTP errors |
| 🟡 **High Latency** | 2 min | API response times spike to 5–30s |
| 🔴 **Disk Space Critical** | 5 min | Disk usage at 95%+, I/O errors |
| 🟡 **Deployment Failure** | 3 min | Crash loops, failed probes, rollback events |

### Investigate with DevOps Agent

After triggering a scenario, ask DevOps Agent questions like:

- *"There seem to be database issues with the order-service. Can you investigate?"*
- *"We're seeing 5xx errors. What's happening?"*
- *"Check the recent error logs in Elasticsearch"*
- *"What indices are available and what errors occurred in the last 10 minutes?"*
- *"Search for OOM errors in the application logs"*

The DevOps Agent will use the MCP tools to search Elasticsearch and provide analysis.

---

## 📊 Elasticsearch Indices

The demo service creates these indices automatically:

| Index Pattern | Content | Key Fields |
|---------------|---------|------------|
| `app-logs-YYYY.MM.DD` | Application logs | `@timestamp`, `level`, `message`, `service`, `hostname`, `trace_id`, `exception_class`, `stack_trace` |
| `access-logs-YYYY.MM.DD` | HTTP access logs | `@timestamp`, `method`, `path`, `status_code`, `response_time_ms`, `client_ip`, `service` |
| `metrics-YYYY.MM.DD` | System metrics | `@timestamp`, `hostname`, `service`, `cpu_percent`, `memory_percent`, `disk_percent`, `heap_used_mb` |

---

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env` and customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `OAUTH_CLIENT_ID` | `devops-agent` | OAuth client ID for DevOps Agent |
| `OAUTH_CLIENT_SECRET` | `demo-secret-change-me` | OAuth client secret (**change this!**) |
| `JWT_SECRET` | `jwt-secret-change-me-in-production` | Secret for signing JWT tokens (**change this!**) |
| `TOKEN_EXPIRY_SECONDS` | `3600` | Token expiry time in seconds |
| `ELASTIC_PASSWORD` | `changeme` | Password for the built-in `elastic` superuser |
| `ES_URL` | `http://elasticsearch:9200` | Elasticsearch URL (override for external clusters) |
| `ES_API_KEY` | *(empty)* | Elasticsearch API key (for external clusters) |
| `ES_USERNAME` | *(empty)* | Elasticsearch username (for external clusters) |
| `ES_PASSWORD` | *(empty)* | Elasticsearch password (for external clusters) |
| `ES_SSL_SKIP_VERIFY` | `false` | Skip SSL verification |

### How Elasticsearch Authentication Works

The bundled Elasticsearch runs with **security enabled** (`xpack.security.enabled=true`). On startup, a dedicated `es-setup` service automatically:

1. Waits for Elasticsearch to be healthy
2. Creates a **read-only API key** for the MCP server (`search`, `list_indices`, `get_mappings`)
3. Creates a **write API key** for the demo service (index logs and metrics)
4. Writes the keys to a shared Docker volume (`es-keys`)

The MCP server and demo service read their respective API keys from the shared volume — no manual key management needed.

### Connecting to Your Own Elasticsearch

To use an external Elasticsearch cluster instead of the bundled one:

1. Edit `.env`:
   ```
   ES_URL=https://your-elasticsearch:9200
   ES_API_KEY=your-base64-encoded-api-key
   ```

2. In `docker-compose.yml`, remove the `elasticsearch` and `es-setup` services, and change the `depends_on` in `mcp-server` and `demo-service` to point to `elasticsearch` with `service_healthy` (or remove `depends_on` entirely).

3. Restart: `docker compose up -d`

---

## 📡 API Reference

### MCP Server (Port 3000)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/mcp` | POST | Bearer Token | MCP Streamable HTTP endpoint |
| `/mcp` | GET | Bearer Token | MCP SSE endpoint |
| `/mcp` | DELETE | Bearer Token | MCP session termination |
| `/oauth/token` | POST | None | OAuth 2.0 token exchange |
| `/health` | GET | None | Health check |

### Demo Service (Port 3001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web dashboard |
| `/api/status` | GET | Current status + active scenarios |
| `/api/scenarios/:id` | POST | Trigger a scenario |
| `/api/scenarios/:id/stop` | POST | Stop a specific scenario |
| `/api/scenarios/stop-all` | POST | Stop all active scenarios |
| `/health` | GET | Health check |

### OAuth Token Request Example

```bash
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=devops-agent&client_secret=YOUR_SECRET&scope=mcp:read"
```

---

## 🔧 Development

### Run almost Without Docker

```bash
# Terminal 1: Start Elasticsearch
docker run -d --name es -p 9200:9200 \
  -e discovery.type=single-node \
  -e xpack.security.enabled=false \
  docker.elastic.co/elasticsearch/elasticsearch:8.15.3

# Terminal 2: Start MCP server
cd mcp-server
npm install
ES_URL=http://localhost:9200 npm run dev

# Terminal 3: Start demo service
cd demo-service
npm install
ES_URL=http://localhost:9200 npm run dev
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20+ / TypeScript 5.x |
| MCP SDK | `@modelcontextprotocol/sdk` |
| HTTP Framework | Express.js |
| ES Client | `@elastic/elasticsearch` |
| OAuth/JWT | `jsonwebtoken` |
| Containerization | Docker + Docker Compose |

### Project Structure

```
aws-devops-agent-elk-mcp/
├── docker-compose.yml          # Local stack orchestration
├── docker-compose.ec2.yml      # EC2 deployment (uses ECR images)
├── .env.example                # Environment variable template
│
├── mcp-server/                 # MCP Server (Streamable HTTP + OAuth 2.0)
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.ts            # Express app entry point
│       ├── config.ts           # Configuration from env vars
│       ├── oauth/              # OAuth 2.0 (JWT, token endpoint, middleware)
│       ├── mcp/                # MCP server setup + tool registration
│       └── tools/              # search, list_indices, get_mappings
│
├── demo-service/               # Demo Service (log generator + web UI)
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.ts            # Express app entry point
│       ├── config.ts           # Configuration
│       ├── elasticsearch.ts    # ES client + index template setup
│       ├── generators/         # Baseline log/metric generators
│       ├── scenarios/          # Triggerable error scenarios
│       └── public/             # Web dashboard
│
├── deploy/                     # AWS EC2 deployment
│   ├── DEPLOYMENT.md           # Detailed AWS deployment guide
│   ├── template.yaml           # CloudFormation template
│   ├── deploy.sh               # One-command deploy
│   └── teardown.sh             # Clean teardown
│
└── scripts/                    # Helper scripts
    └── stop.sh                 # Stop the local stack
```

---

## 🔒 Security Notes

- The built-in OAuth server is for **demo/development purposes only**
- In production, replace with your corporate IdP (AWS Cognito, Okta, Azure AD, etc.)
- Always use strong, unique values for `OAUTH_CLIENT_SECRET` and `JWT_SECRET`
- The MCP tools are **read-only** — they cannot modify Elasticsearch data
- Use Elasticsearch API keys with minimal permissions in production

---

## 🐛 Troubleshooting

### Elasticsearch not starting

```bash
# Check logs
docker compose logs elasticsearch

# Increase Docker memory (ES needs at least 2GB)
# Docker Desktop → Settings → Resources → Memory → 4GB+
```

### MCP server can't connect to Elasticsearch

```bash
# Check ES is healthy
curl http://localhost:9200/_cluster/health

# Check MCP server logs
docker compose logs mcp-server
```

### OAuth token errors

```bash
# Test token endpoint directly
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=devops-agent&client_secret=YOUR_SECRET"
```

---

## 📄 License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

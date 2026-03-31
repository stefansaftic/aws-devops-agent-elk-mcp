#!/bin/bash
# =============================================================================
# Deploy ELK MCP Server to AWS
# =============================================================================
# This script:
# 1. Deploys CloudFormation stack (VPC, EC2, NLB, API GW, ECR, S3)
# 2. Builds Docker images locally
# 3. Pushes images to ECR
# 4. Uploads code bundle to S3
# 5. EC2 UserData pulls from ECR/S3 on boot (no internet needed)
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

STACK_NAME="${STACK_NAME:-elk-mcp-demo}"
REGION="${AWS_REGION:-us-east-1}"
TEMPLATE_FILE="$SCRIPT_DIR/template.yaml"

# Default parameters
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.medium}"
OAUTH_SECRET="${OAUTH_CLIENT_SECRET:-demo-secret-change-me}"
JWT_SECRET="${JWT_SECRET:-jwt-secret-$(openssl rand -hex 16)}"
AUTO_SHUTDOWN="${AUTO_SHUTDOWN_MINUTES:-120}"
KEY_PAIR="${KEY_PAIR_NAME:-}"
ES_VERSION="${ES_VERSION:-8.17.0}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

header() { echo -e "\n${YELLOW}═══════════════════════════════════════════════════${NC}"; echo -e "${YELLOW}  $1${NC}"; echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"; }

echo -e "${YELLOW}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║     Deploy ELK MCP Server to AWS                    ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Stack:    ${STACK_NAME}"
echo "║  Region:   ${REGION}"
echo "║  Instance: ${INSTANCE_TYPE}"
echo "║  Shutdown: ${AUTO_SHUTDOWN} minutes"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Prerequisites ────────────────────────────────────────────────────────
header "Step 1: Check Prerequisites"

for cmd in aws docker jq; do
  if ! command -v $cmd &> /dev/null; then
    echo -e "${RED}❌ $cmd not found. Please install it first.${NC}"
    exit 1
  fi
done
echo -e "${GREEN}✅ All prerequisites found${NC}"

# Verify AWS credentials
echo "🔑 Verifying AWS credentials..."
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text --region "$REGION" 2>/dev/null)
if [ -z "$AWS_ACCOUNT" ]; then
    echo -e "${RED}❌ AWS credentials not configured. Run 'aws configure' first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ AWS Account: ${AWS_ACCOUNT}${NC}"

ECR_URL="${AWS_ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"

# ─── Deploy CloudFormation Stack ──────────────────────────────────────────
header "Step 2: Deploy CloudFormation Stack"

echo "📋 Validating template..."
aws cloudformation validate-template \
    --template-body "file://${TEMPLATE_FILE}" \
    --region "$REGION" > /dev/null
echo -e "${GREEN}✅ Template valid${NC}"

echo ""
echo "🚀 Deploying stack '${STACK_NAME}'..."
echo "   (This creates VPC, EC2, NLB, API GW, ECR repos, S3 bucket)"
echo "   Takes ~5-8 minutes..."

aws cloudformation deploy \
    --stack-name "$STACK_NAME" \
    --template-file "$TEMPLATE_FILE" \
    --region "$REGION" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
        InstanceType="$INSTANCE_TYPE" \
        OAuthClientSecret="$OAUTH_SECRET" \
        JwtSecret="$JWT_SECRET" \
        AutoShutdownMinutes="$AUTO_SHUTDOWN" \
        KeyPairName="$KEY_PAIR" \
    --tags \
        Project=elk-mcp-demo \
        Environment=demo \
    --no-fail-on-empty-changeset

echo -e "${GREEN}✅ Stack deployed${NC}"

# Get stack outputs
OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs' \
    --output json)

BUCKET_NAME=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="CodeBucketName") | .OutputValue')
API_URL=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="ApiGatewayUrl") | .OutputValue')
INSTANCE_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="InstanceId") | .OutputValue')

echo "  Bucket: $BUCKET_NAME"
echo "  API URL: $API_URL"
echo "  Instance: $INSTANCE_ID"

# ─── Build & Push Docker Images ──────────────────────────────────────────
header "Step 3: Build & Push Docker Images to ECR"

# ECR Login
echo "🔐 Logging into ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_URL"
echo -e "${GREEN}✅ ECR login successful${NC}"

# Build and push MCP Server
echo ""
echo -e "${BLUE}📦 Building mcp-server...${NC}"
docker build -t "${ECR_URL}/${STACK_NAME}/mcp-server:latest" "$PROJECT_DIR/mcp-server" --platform linux/amd64
echo -e "${BLUE}⬆️  Pushing mcp-server to ECR...${NC}"
docker push "${ECR_URL}/${STACK_NAME}/mcp-server:latest"
echo -e "${GREEN}✅ mcp-server pushed${NC}"

# Build and push Demo Service
echo ""
echo -e "${BLUE}📦 Building demo-service...${NC}"
docker build -t "${ECR_URL}/${STACK_NAME}/demo-service:latest" "$PROJECT_DIR/demo-service" --platform linux/amd64
echo -e "${BLUE}⬆️  Pushing demo-service to ECR...${NC}"
docker push "${ECR_URL}/${STACK_NAME}/demo-service:latest"
echo -e "${GREEN}✅ demo-service pushed${NC}"

# Pull, tag, and push Elasticsearch
echo ""
echo -e "${BLUE}📦 Pulling Elasticsearch ${ES_VERSION}...${NC}"
docker pull --platform linux/amd64 "docker.elastic.co/elasticsearch/elasticsearch:${ES_VERSION}"
docker tag "docker.elastic.co/elasticsearch/elasticsearch:${ES_VERSION}" "${ECR_URL}/${STACK_NAME}/elasticsearch:latest"
echo -e "${BLUE}⬆️  Pushing elasticsearch to ECR (~1GB, may take a few minutes)...${NC}"
docker push "${ECR_URL}/${STACK_NAME}/elasticsearch:latest"
echo -e "${GREEN}✅ elasticsearch pushed${NC}"

# ─── Upload Code Bundle to S3 ────────────────────────────────────────────
header "Step 4: Upload Code Bundle to S3"

# Create temp directory for bundle
BUNDLE_DIR=$(mktemp -d)

# Copy docker-compose.ec2.yml
cp "$PROJECT_DIR/docker-compose.ec2.yml" "$BUNDLE_DIR/docker-compose.ec2.yml"

# Create the bundle
cd "$BUNDLE_DIR"
tar czf app-bundle.tar.gz docker-compose.ec2.yml
aws s3 cp app-bundle.tar.gz "s3://${BUCKET_NAME}/app-bundle.tar.gz" --region "$REGION"
echo -e "${GREEN}✅ Code bundle uploaded to S3${NC}"

# Upload Docker Compose binary to S3 (EC2 can't download from GitHub)
echo ""
echo -e "${BLUE}📦 Downloading Docker Compose binary for Linux...${NC}"
COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep tag_name | cut -d '"' -f 4)
curl -sL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" -o docker-compose-linux-x86_64
aws s3 cp docker-compose-linux-x86_64 "s3://${BUCKET_NAME}/docker-compose-linux-x86_64" --region "$REGION"
echo -e "${GREEN}✅ Docker Compose binary uploaded to S3${NC}"

# Cleanup
rm -rf "$BUNDLE_DIR"

# ─── Summary ──────────────────────────────────────────────────────────────
header "Deployment Complete!"

echo "$OUTPUTS" | jq -r '.[] | "  \(.OutputKey): \(.OutputValue)"'

MCP_URL=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="MCPEndpoint") | .OutputValue')
OAUTH_URL=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="OAuthTokenEndpoint") | .OutputValue')

echo ""
echo -e "${YELLOW}📝 DevOps Agent Registration:${NC}"
echo "  Endpoint URL:  ${MCP_URL}"
echo "  Exchange URL:  ${OAUTH_URL}"
echo "  Client ID:     devops-agent"
echo "  Client Secret: ${OAUTH_SECRET}"
echo "  Scopes:        mcp:read"
echo ""
echo -e "${YELLOW}🔧 Instance Management:${NC}"
echo "  Start:  curl -X POST ${API_URL}/instance/start"
echo "  Stop:   curl -X POST ${API_URL}/instance/stop"
echo "  Status: curl ${API_URL}/instance/status"
echo ""
echo -e "${YELLOW}⏱️  Auto-shutdown: ${AUTO_SHUTDOWN} minutes after boot${NC}"
echo ""
echo "  The EC2 instance is now booting and pulling images from ECR."
echo "  Wait ~3-5 minutes for Docker Compose to start, then test:"
echo "  curl ${API_URL}/health"

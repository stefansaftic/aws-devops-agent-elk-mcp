#!/bin/bash
# =============================================================================
# Teardown ELK MCP Server from AWS (deletes entire stack — $0/day)
# Safe to run multiple times — retries any failed deletions.
# =============================================================================
set -e

STACK_NAME="${STACK_NAME:-elk-mcp-demo}"
REGION="${AWS_REGION:-us-east-1}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║     Teardown ELK MCP Server from AWS                ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Stack:  ${STACK_NAME}"
echo "║  Region: ${REGION}"
echo "║                                                      ║"
echo "║  ⚠️  This will DELETE all resources!                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if stack exists (handle both missing and failed states)
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
    echo -e "${YELLOW}Stack '${STACK_NAME}' not found in ${REGION}.${NC}"
    echo "Checking for leftover ECR repos and S3 buckets..."
else
    echo "Current stack status: ${STACK_STATUS}"
    echo ""

    # Confirm deletion (skip if already in DELETE_IN_PROGRESS or DELETE_FAILED)
    if [[ "$STACK_STATUS" != *"DELETE"* ]]; then
        read -p "Are you sure you want to delete stack '${STACK_NAME}'? (yes/no): " CONFIRM
        if [ "$CONFIRM" != "yes" ]; then
            echo "Aborted."
            exit 0
        fi
    fi
fi

# ─── Empty S3 Bucket (required before CloudFormation can delete it) ───────
echo ""
echo "🗑️  Emptying S3 bucket..."

# Try to get bucket name from stack outputs first
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CodeBucketName`].OutputValue' \
    --output text 2>/dev/null || echo "")

# Fallback: derive bucket name from stack name + account ID
if [ -z "$BUCKET_NAME" ] || [ "$BUCKET_NAME" = "None" ]; then
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION" 2>/dev/null || echo "")
    if [ -n "$ACCOUNT_ID" ]; then
        BUCKET_NAME="${STACK_NAME}-code-${ACCOUNT_ID}"
    fi
fi

if [ -n "$BUCKET_NAME" ]; then
    # Check if bucket exists
    if aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
        echo "  Emptying s3://${BUCKET_NAME}..."
        aws s3 rm "s3://${BUCKET_NAME}" --recursive --region "$REGION" 2>/dev/null || true
        echo -e "${GREEN}✅ S3 bucket emptied${NC}"
    else
        echo "  Bucket ${BUCKET_NAME} not found or already empty"
    fi
fi

# ─── Force-Delete ECR Repositories (--force deletes all images + repo) ────
echo ""
echo "🗑️  Force-deleting ECR repositories..."
for REPO_SUFFIX in mcp-server demo-service elasticsearch; do
    REPO_NAME="${STACK_NAME}/${REPO_SUFFIX}"
    echo "  Deleting ${REPO_NAME}..."
    # --force deletes all images and the repository in one call
    aws ecr delete-repository \
        --repository-name "$REPO_NAME" \
        --region "$REGION" \
        --force \
        > /dev/null 2>&1 && echo -e "  ${GREEN}✅ ${REPO_NAME} deleted${NC}" || echo "  ⚠️  ${REPO_NAME} not found (already deleted)"
done

# ─── Delete CloudFormation Stack ──────────────────────────────────────────
echo ""

if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
    echo -e "${GREEN}✅ No stack to delete — all resources cleaned up.${NC}"
    exit 0
fi

# If stack is in DELETE_FAILED, we need to continue the deletion
if [ "$STACK_STATUS" = "DELETE_FAILED" ]; then
    echo "⚠️  Stack is in DELETE_FAILED state — retrying deletion..."
    aws cloudformation delete-stack \
        --stack-name "$STACK_NAME" \
        --region "$REGION"
elif [[ "$STACK_STATUS" != "DELETE_IN_PROGRESS" ]]; then
    echo "🗑️  Deleting CloudFormation stack '${STACK_NAME}'..."
    aws cloudformation delete-stack \
        --stack-name "$STACK_NAME" \
        --region "$REGION"
else
    echo "⏳ Stack deletion already in progress..."
fi

echo "   Waiting for stack deletion to complete (~3-5 minutes)..."
aws cloudformation wait stack-delete-complete \
    --stack-name "$STACK_NAME" \
    --region "$REGION"

echo ""
echo -e "${GREEN}✅ Stack '${STACK_NAME}' deleted successfully!${NC}"
echo "   All resources have been removed. Cost: \$0/day."

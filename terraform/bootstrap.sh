#!/bin/bash
# Bootstrap script: creates the GCS bucket for Terraform state.
# Run this ONCE before the first terraform init.
#
# Usage: ./bootstrap.sh <project-id>

set -euo pipefail

PROJECT_ID="${1:?Usage: $0 <project-id>}"
BUCKET="gs://${PROJECT_ID}-tf-state"
REGION="southamerica-east1"

echo "Creating Terraform state bucket: ${BUCKET}"

gcloud storage buckets create "${BUCKET}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --uniform-bucket-level-access

echo "Enabling versioning for state protection..."
gcloud storage buckets update "${BUCKET}" --versioning

echo "Done. Configure backend with:"
echo "  terraform init -backend-config=\"bucket=${PROJECT_ID}-tf-state\""

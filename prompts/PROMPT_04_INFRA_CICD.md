# PROMPT 04 — Infraestrutura Terraform + CI/CD (GitHub Actions)

## Objetivo

Criar toda a infraestrutura no GCP via Terraform e o pipeline de CI/CD via GitHub Actions. O deploy deve funcionar tanto local (`terraform apply`) quanto via GitHub Actions.

## O que implementar

### 1. Terraform — Recursos GCP

**Provider e Backend (`terraform/main.tf`)**
```hcl
# Provider: google
# Backend: GCS bucket para state (criar manualmente 1x)
# Região padrão: southamerica-east1 (São Paulo)
```

**Cloud Run Service (`terraform/cloud-run.tf`)**
- Imagem Docker do pipeline (GCR ou Artifact Registry)
- Memória: 512MB (Puppeteer precisa de mais RAM)
- CPU: 1 vCPU
- Timeout: 300s
- Min instances: 0 (scale to zero — custo zero quando idle)
- Max instances: 1 (não precisa de mais)
- Variáveis de ambiente injetadas do Secret Manager
- Allow unauthenticated (para webhook do Telegram)

**Cloud Scheduler (`terraform/cloud-scheduler.tf`)**
- Job 1: `content-morning` — 08:00 BRT (11:00 UTC) → POST Cloud Run `/generate`
- Job 2: `content-evening` — 18:00 BRT (21:00 UTC) → POST Cloud Run `/generate`
- Job 3: `meta-token-refresh` — Dia 1 de cada mês, 03:00 UTC → POST Cloud Run `/refresh-token`
- Timezone: America/Sao_Paulo
- Retry: 1 tentativa, backoff 60s

**Secret Manager (`terraform/secrets.tf`)**
```hcl
# Criar secrets para cada variável sensível:
# - gemini-api-key
# - deepseek-api-key
# - anthropic-api-key
# - google-sheets-service-account
# - meta-app-id
# - meta-app-secret
# - meta-access-token (este é atualizado pelo job de refresh)
# - instagram-account-id
# - telegram-bot-token
# - telegram-chat-id
#
# Cloud Run service account tem permissão de leitura em todos
# O job de refresh tem permissão de escrita em meta-access-token
```

**GCS Bucket para imagens temporárias (`terraform/storage.tf`)**
- Nome: `${project_id}-temp-images`
- Location: `southamerica-east1`
- Lifecycle: delete after 1 day (cleanup automático)
- Uniform bucket-level access

**Artifact Registry (`terraform/registry.tf`)**
- Repository para Docker images do pipeline
- Location: `southamerica-east1`

**IAM (`terraform/iam.tf`)**
- Service account para Cloud Run com roles:
  - `roles/secretmanager.secretAccessor`
  - `roles/storage.objectAdmin` (bucket temp)
  - `roles/run.invoker` (para Scheduler chamar)
- Service account para Cloud Scheduler com role:
  - `roles/run.invoker`

**Variables (`terraform/variables.tf`)**
```hcl
variable "project_id" { type = string }
variable "region" { default = "southamerica-east1" }
variable "scheduler_timezone" { default = "America/Sao_Paulo" }
variable "morning_schedule" { default = "0 8 * * *" }     # 08:00 BRT
variable "evening_schedule" { default = "0 18 * * *" }    # 18:00 BRT
```

**Outputs (`terraform/outputs.tf`)**
```hcl
output "cloud_run_url" { value = google_cloud_run_v2_service.pipeline.uri }
output "temp_bucket_name" { value = google_cloud_storage_bucket.temp_images.name }
```

### 2. Dockerfile

```dockerfile
FROM node:20-slim

# Puppeteer dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
COPY src/templates/ ./dist/templates/

EXPOSE 8080
CMD ["node", "dist/index.js"]
```

### 3. GitHub Actions — CI/CD (`.github/workflows/deploy.yml`)

```yaml
# Trigger: push na branch main
# Steps:
# 1. Checkout
# 2. Setup Node 20
# 3. npm ci && npm run build && npm test
# 4. Auth no GCP (Workload Identity Federation OU service account key)
# 5. Build Docker image
# 6. Push para Artifact Registry
# 7. Terraform init + plan + apply (auto-approve)
#    - Injetar secrets como TF_VAR_*
#    - Ou usar terraform com -var-file
# 8. Verificar Cloud Run health check
```

**GitHub Repository Secrets necessários:**

```
# Infraestrutura GCP
GCP_PROJECT_ID
GCP_REGION
GCP_SERVICE_ACCOUNT_KEY        # JSON base64 da SA com permissões de deploy

# OU (preferível) Workload Identity Federation:
GCP_WORKLOAD_IDENTITY_PROVIDER # projects/*/locations/global/workloadIdentityPools/*/providers/*
GCP_SERVICE_ACCOUNT_EMAIL      # sa@project.iam.gserviceaccount.com

# APIs de LLM
GEMINI_API_KEY
DEEPSEEK_API_KEY
ANTHROPIC_API_KEY

# Google Sheets
GOOGLE_SHEETS_ID
GOOGLE_SERVICE_ACCOUNT_JSON    # base64 do JSON da SA com acesso ao Sheets

# Meta / Instagram
META_APP_ID
META_APP_SECRET
META_ACCESS_TOKEN              # Token longo (renovado pelo job)
INSTAGRAM_ACCOUNT_ID

# Telegram
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

# Terraform State
TF_STATE_BUCKET                # Nome do bucket GCS para o Terraform state
```

**GitHub Repository Variables (não-secrets):**

```
GCP_REGION=southamerica-east1
SCHEDULER_TIMEZONE=America/Sao_Paulo
MORNING_SCHEDULE=0 8 * * *
EVENING_SCHEDULE=0 18 * * *
```

### 4. Entry point atualizado (`src/index.ts`)

O Cloud Run precisa expor um HTTP server com os endpoints:

```typescript
// GET  /health              → Health check
// POST /generate            → Dispara geração (chamado pelo Scheduler)
// POST /webhook/telegram    → Callback dos botões do Telegram
// POST /refresh-token       → Renova Meta access token (chamado pelo Scheduler)
```

Usar framework leve (fastify ou express) ou http nativo do Node.

### 5. Terraform State Bootstrap

Incluir script `terraform/bootstrap.sh`:
```bash
#!/bin/bash
# Cria o bucket para Terraform state (rodar 1x manualmente)
gcloud storage buckets create gs://${PROJECT_ID}-tf-state \
  --location=southamerica-east1 \
  --uniform-bucket-level-access
```

---

## Entregáveis deste prompt

1. `terraform/main.tf`
2. `terraform/variables.tf`
3. `terraform/outputs.tf`
4. `terraform/cloud-run.tf`
5. `terraform/cloud-scheduler.tf`
6. `terraform/secrets.tf`
7. `terraform/storage.tf`
8. `terraform/registry.tf`
9. `terraform/iam.tf`
10. `terraform/bootstrap.sh`
11. `Dockerfile`
12. `.github/workflows/deploy.yml`
13. `src/index.ts` (entry point com todos os endpoints)
14. `README.md` com instruções de setup

Comece implementando. Após terminar, diga:
> "Prompt 04 concluído. Pipeline completo. Revise o README e faça o deploy."

# bot-news — Content Pipeline

Pipeline automatizado de geração, consolidação e publicação de conteúdo tech para Instagram, orquestrado por 3 LLMs em paralelo com deploy no GCP Cloud Run.

## Arquitetura

```
Cloud Scheduler (08h / 18h BRT)
        │
        ▼
   Cloud Run (/generate)
        │
        ├── Gemini 2.5 Pro ──┐
        ├── DeepSeek V3.2 ───┤── Google Sheets (raw)
        └── Claude Haiku 4.5 ┘
                                  │
                                  ▼
                          Gemini 2.5 Flash (consolidação)
                                  │
                                  ▼
                          Telegram (aprovação)
                                  │
                           ┌──────┴──────┐
                        Approve        Reject
                           │
                     Puppeteer (imagem)
                           │
                     Instagram (Meta API)
```

## Stack

- **Runtime:** Node.js 20 / TypeScript
- **LLMs:** Gemini 2.5 Pro, DeepSeek V3.2, Claude Haiku 4.5 (native fetch, no SDKs)
- **Consolidação:** Gemini 2.5 Flash (fallback: DeepSeek)
- **Imagens:** Puppeteer + Chromium (1080x1080 PNG)
- **Infra:** GCP Cloud Run, Cloud Scheduler, Secret Manager, GCS, Artifact Registry
- **IaC:** Terraform
- **CI/CD:** GitHub Actions

## Endpoints (Cloud Run)

| Método | Rota                | Descrição                              |
|--------|---------------------|----------------------------------------|
| GET    | `/health`           | Health check                           |
| POST   | `/generate`         | Dispara geração + consolidação (Scheduler) |
| POST   | `/webhook/telegram` | Callback dos botões do Telegram        |
| POST   | `/refresh-token`    | Renova Meta access token (mensal)      |

## Setup Local

### Pré-requisitos

- Node.js 20+
- Google Cloud SDK (`gcloud`)
- Terraform >= 1.5
- Docker

### 1. Instalar dependências

```bash
npm ci
```

### 2. Variáveis de ambiente

Copie e preencha:

```bash
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="southamerica-east1"
export GEMINI_API_KEY="..."
export DEEPSEEK_API_KEY="..."
export ANTHROPIC_API_KEY="..."
export GOOGLE_SHEETS_ID="..."
export GOOGLE_SERVICE_ACCOUNT_JSON='{ ... }'
export META_APP_ID="..."
export META_APP_SECRET="..."
export META_ACCESS_TOKEN="..."
export INSTAGRAM_ACCOUNT_ID="..."
export TELEGRAM_BOT_TOKEN="..."
export TELEGRAM_CHAT_ID="..."
```

### 3. Build e rodar

```bash
npm run build
npm start
```

## Deploy GCP

### 1. Bootstrap do Terraform State (uma vez)

```bash
cd terraform
./bootstrap.sh your-project-id
```

### 2. Provisionar infraestrutura

```bash
cd terraform
terraform init -backend-config="bucket=your-project-id-tf-state"
terraform plan -var="project_id=your-project-id"
terraform apply -var="project_id=your-project-id"
```

### 3. Build e push da imagem Docker

```bash
# Autenticar no Artifact Registry
gcloud auth configure-docker southamerica-east1-docker.pkg.dev

# Build
docker build -t southamerica-east1-docker.pkg.dev/PROJECT_ID/content-pipeline/content-pipeline:latest .

# Push
docker push southamerica-east1-docker.pkg.dev/PROJECT_ID/content-pipeline/content-pipeline:latest
```

### 4. Popular secrets no Secret Manager

```bash
echo -n "YOUR_VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-
```

## CI/CD (GitHub Actions)

O workflow `.github/workflows/deploy.yml` faz deploy automático a cada push na `main`:

1. Build + testes
2. Auth no GCP (Workload Identity Federation)
3. Build e push da imagem Docker para Artifact Registry
4. Terraform plan + apply
5. Verificação do health check

### GitHub Secrets necessários

| Secret                            | Descrição                                  |
|-----------------------------------|--------------------------------------------|
| `GCP_PROJECT_ID`                  | ID do projeto GCP                          |
| `GCP_WORKLOAD_IDENTITY_PROVIDER`  | Provider do Workload Identity Federation   |
| `GCP_SERVICE_ACCOUNT_EMAIL`       | Email da SA de deploy                      |
| `TF_STATE_BUCKET`                 | Bucket GCS para Terraform state            |
| `GEMINI_API_KEY`                  | API key do Gemini                          |
| `DEEPSEEK_API_KEY`                | API key do DeepSeek                        |
| `ANTHROPIC_API_KEY`               | API key do Anthropic                       |
| `GOOGLE_SHEETS_ID`               | ID da planilha Google Sheets               |
| `GOOGLE_SERVICE_ACCOUNT_JSON`     | JSON da SA (base64)                        |
| `META_APP_ID`                     | App ID do Meta                             |
| `META_APP_SECRET`                 | App Secret do Meta                         |
| `META_ACCESS_TOKEN`               | Token de acesso Meta (long-lived)          |
| `INSTAGRAM_ACCOUNT_ID`           | ID da conta Instagram                      |
| `TELEGRAM_BOT_TOKEN`             | Token do bot Telegram                      |
| `TELEGRAM_CHAT_ID`               | Chat ID do Telegram                        |

### GitHub Variables (não-secrets)

| Variable             | Default                |
|----------------------|------------------------|
| `GCP_REGION`         | `southamerica-east1`   |
| `SCHEDULER_TIMEZONE` | `America/Sao_Paulo`    |
| `MORNING_SCHEDULE`   | `0 8 * * *`            |
| `EVENING_SCHEDULE`   | `0 18 * * *`           |

## Terraform Resources

| Recurso                    | Descrição                              |
|----------------------------|----------------------------------------|
| Cloud Run                  | Serviço principal (scale-to-zero)      |
| Cloud Scheduler (morning)  | 08:00 BRT → POST /generate            |
| Cloud Scheduler (evening)  | 18:00 BRT → POST /generate            |
| Cloud Scheduler (refresh)  | Dia 1/mês 03:00 UTC → POST /refresh-token |
| Secret Manager (11 secrets)| Todas as variáveis sensíveis           |
| GCS Bucket                 | Imagens temporárias (auto-delete 1 dia)|
| Artifact Registry          | Docker images do pipeline              |
| IAM Service Accounts       | Cloud Run SA + Scheduler SA            |

## Prompt Runner

Para executar os prompts de desenvolvimento sequencialmente:

```bash
./prompt-runner/prompt-runner.sh run ./prompts --agent claude --model opus --verbose --yes
```

## Estrutura

```
src/
├── index.ts                    # Entry point (HTTP server)
├── types.ts                    # Tipos compartilhados
├── utils/config.ts             # Configuração via env vars
├── clients/                    # Clientes de APIs externas
│   ├── gemini.ts
│   ├── deepseek.ts
│   ├── claude.ts
│   └── sheets.ts
├── prompts/                    # Templates de prompts LLM
│   ├── prompt-01-geracao.ts
│   └── prompt-02-consolidacao.ts
├── services/                   # Lógica de negócio
│   ├── generation.service.ts
│   ├── consolidation.service.ts
│   ├── notification.service.ts
│   ├── image.service.ts
│   └── instagram.service.ts
└── templates/
    └── post-template.html      # Template HTML para imagens

terraform/
├── main.tf                     # Provider + backend
├── variables.tf                # Input variables
├── outputs.tf                  # Output values
├── cloud-run.tf                # Cloud Run service
├── cloud-scheduler.tf          # Scheduler jobs
├── secrets.tf                  # Secret Manager
├── storage.tf                  # GCS bucket
├── registry.tf                 # Artifact Registry
├── iam.tf                      # Service accounts + roles
└── bootstrap.sh                # State bucket bootstrap

.github/workflows/
└── deploy.yml                  # CI/CD pipeline
```

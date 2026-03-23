# Variáveis do Repositório GitHub — Guia de Configuração

## GitHub Repository Secrets (sensíveis)

Configure em: `Settings → Secrets and variables → Actions → Secrets`

### APIs de LLM

| Secret | Onde obter | Observações |
|--------|-----------|-------------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API Key | Free tier: 100 req/dia (Pro), 500 req/dia (Flash) |
| `DEEPSEEK_API_KEY` | [deepinfra.com](https://deepinfra.com) → Dashboard → API Keys | DeepSeek R1 via DeepInfra |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys | $5 crédito inicial, expira em 30 dias |

### Google Sheets

| Secret | Onde obter | Observações |
|--------|-----------|-------------|
| `GOOGLE_SHEETS_ID` | URL da planilha: `docs.google.com/spreadsheets/d/{ESTE_ID}/edit` | Criar a planilha antes |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | GCP Console → IAM → Service Accounts → Keys → JSON | Base64 encode: `cat sa.json \| base64 -w0` |

**Setup do Sheets:**
1. Criar service account no GCP
2. Gerar chave JSON
3. Compartilhar a planilha com o email da SA (ex: `pipeline@project.iam.gserviceaccount.com`)
4. Base64 encode o JSON e colar como secret

### Meta / Instagram

| Secret | Onde obter | Observações |
|--------|-----------|-------------|
| `META_APP_ID` | [developers.facebook.com](https://developers.facebook.com) → Meus Apps → App ID | Criar app tipo "Business" |
| `META_APP_SECRET` | developers.facebook.com → Configurações → Básico | Não compartilhar |
| `META_ACCESS_TOKEN` | Graph API Explorer → gerar token → trocar por longa duração | Dura 60 dias, renovado pelo job |
| `INSTAGRAM_ACCOUNT_ID` | Graph API: `GET /me/accounts` → `instagram_business_account.id` | Conta precisa ser Business/Creator |

**Setup do Instagram Business:**
1. Criar conta Instagram
2. Converter para Business (Configurações → Conta → Mudar para conta profissional)
3. Vincular a uma Facebook Page
4. No developers.facebook.com, criar App → adicionar produto "Instagram Graph API"
5. Gerar token com permissões: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`
6. Trocar por token de longa duração:
```bash
curl "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_TOKEN}"
```

### Telegram

| Secret | Onde obter | Observações |
|--------|-----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram → @BotFather → /newbot | Formato: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11` |
| `TELEGRAM_CHAT_ID` | Enviar msg para o bot, acessar `api.telegram.org/bot{TOKEN}/getUpdates` | Número inteiro (pode ser negativo para grupos) |

**Setup do Telegram Bot:**
1. Abrir Telegram, buscar @BotFather
2. Enviar `/newbot`, seguir instruções
3. Copiar o token
4. Enviar qualquer mensagem ao bot
5. Acessar `https://api.telegram.org/bot{TOKEN}/getUpdates` → pegar `chat.id`

### GCP (Infraestrutura)

| Secret | Onde obter | Observações |
|--------|-----------|-------------|
| `GCP_PROJECT_ID` | GCP Console → Selecionar projeto → ID | Ex: `content-pipeline-123456` |
| `GCP_SERVICE_ACCOUNT_KEY` | IAM → Service Accounts → Keys → JSON | Base64 encode. SA precisa de roles de deploy |

**Opção preferível — Workload Identity Federation (sem chave JSON):**

| Secret | Onde obter | Observações |
|--------|-----------|-------------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Seguir [guia oficial](https://github.com/google-github-actions/auth#setup) | Formato: `projects/*/locations/global/...` |
| `GCP_SERVICE_ACCOUNT_EMAIL` | IAM → Service Accounts | Ex: `deployer@project.iam.gserviceaccount.com` |

### Terraform State

| Secret | Onde obter | Observações |
|--------|-----------|-------------|
| `TF_STATE_BUCKET` | Criar manualmente via `bootstrap.sh` | Ex: `content-pipeline-123456-tf-state` |

---

## GitHub Repository Variables (não-sensíveis)

Configure em: `Settings → Secrets and variables → Actions → Variables`

| Variable | Valor | Observações |
|----------|-------|-------------|
| `GCP_REGION` | `southamerica-east1` | São Paulo |
| `SCHEDULER_TIMEZONE` | `America/Sao_Paulo` | Para o Cloud Scheduler |
| `MORNING_SCHEDULE` | `0 8 * * *` | 08h BRT |
| `EVENING_SCHEDULE` | `0 18 * * *` | 18h BRT |

---

## Checklist de Primeiro Deploy

- [ ] 1. Criar projeto no GCP
- [ ] 2. Habilitar APIs: Cloud Run, Cloud Scheduler, Secret Manager, Artifact Registry, Cloud Storage, Sheets API
- [ ] 3. Criar service accounts (deploy + runtime)
- [ ] 4. Rodar bootstrap.sh (bucket para TF state)
- [ ] 5. Criar planilha no Google Sheets e compartilhar com SA
- [ ] 6. Criar conta Instagram Business + vincular Facebook Page
- [ ] 7. Criar App na Meta e gerar token longo
- [ ] 8. Criar bot no Telegram
- [ ] 9. Obter API keys: Gemini, DeepSeek, Anthropic
- [ ] 10. Configurar todos os secrets no GitHub
- [ ] 11. Push na main → GitHub Actions deploya tudo
- [ ] 12. Verificar Cloud Run URL + health check
- [ ] 13. Configurar webhook do Telegram: `curl "https://api.telegram.org/bot{TOKEN}/setWebhook?url={CLOUD_RUN_URL}/webhook/telegram"`
- [ ] 14. Testar manualmente: `POST {CLOUD_RUN_URL}/generate`
- [ ] 15. Aguardar notificação no Telegram e aprovar

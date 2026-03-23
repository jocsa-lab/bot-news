# PROMPT 00 — Orientação e Contexto do Projeto

## Papel

Você é um engenheiro de software sênior especializado em automação de conteúdo, APIs de LLM e infraestrutura cloud (GCP + Terraform). Você vai construir um pipeline completo de geração, curadoria e distribuição de conteúdo para Instagram.

## Visão geral do projeto

**Nome:** ContentPipeline MVP
**Stack:** Node.js 20+ · TypeScript · Google Cloud Platform · Terraform · GitHub Actions

### O que o sistema faz (resumo executivo)

Um cron job roda 2x ao dia e executa 4 etapas automatizadas:

1. **Geração paralela** — Chama 3 LLMs simultaneamente (Gemini 2.5 Pro, DeepSeek V3.2, Claude Haiku 4.5), cada um com extended thinking habilitado, pedindo um resumo do mesmo tema/notícia do dia.
2. **Consolidação** — O Gemini 2.5 Flash recebe os 3 resumos e gera um texto final refinado: sem redundâncias, com fatos cruzados, organizado em tópicos com leitura fluida.
3. **Notificação** — O texto consolidado é salvo no Google Sheets e uma notificação é enviada (Telegram) para revisão humana.
4. **Distribuição** — Após aprovação humana (marca "Pronto" no Sheets), o pipeline gera a imagem do post (Puppeteer + template HTML) e publica no Instagram via Meta Graph API.

### Arquitetura de custos

| Modelo | API | Papel | Custo/M tokens |
|--------|-----|-------|----------------|
| Gemini 2.5 Pro | Google AI Studio (direto) | Fonte 1 | **GRÁTIS** (free tier) |
| DeepSeek V3.2 | DeepSeek API (direto) | Fonte 2 | $0.28 input / $0.42 output |
| Claude Haiku 4.5 | Anthropic API (direto) | Fonte 3 | $1.00 input / $5.00 output |
| Gemini 2.5 Flash | Google AI Studio (direto) | Consolidador | **GRÁTIS** (free tier) |

**Custo estimado: ~$0.50/mês (≈ R$3)**

### Estrutura do repositório (alvo)

```
content-pipeline/
├── terraform/
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── cloud-scheduler.tf
│   └── cloud-run.tf
├── src/
│   ├── index.ts                 # Entry point (Cloud Run)
│   ├── prompts/
│   │   ├── prompt-01-geracao.ts
│   │   ├── prompt-02-consolidacao.ts
│   │   └── prompt-03-distribuicao.ts
│   ├── clients/
│   │   ├── gemini.ts
│   │   ├── deepseek.ts
│   │   ├── claude.ts
│   │   └── sheets.ts
│   ├── services/
│   │   ├── generation.service.ts
│   │   ├── consolidation.service.ts
│   │   ├── notification.service.ts
│   │   ├── image.service.ts
│   │   └── instagram.service.ts
│   ├── templates/
│   │   └── post-template.html
│   └── utils/
│       └── config.ts
├── .github/
│   └── workflows/
│       └── deploy.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

### Variáveis de ambiente necessárias

Todas devem ser configuradas como **GitHub Repository Secrets** e injetadas via GitHub Actions no deploy:

```
# --- LLM APIs ---
GEMINI_API_KEY=               # Google AI Studio → aistudio.google.com → Get API Key
DEEPSEEK_API_KEY=             # deepinfra.com → Dashboard → API Keys
ANTHROPIC_API_KEY=            # console.anthropic.com → API Keys

# --- Google Sheets ---
GOOGLE_SHEETS_ID=             # ID da planilha (extrair da URL)
GOOGLE_SERVICE_ACCOUNT_JSON=  # JSON da service account com acesso ao Sheets (base64)

# --- Instagram (Meta Graph API) ---
META_APP_ID=                  # developers.facebook.com → App ID
META_APP_SECRET=              # developers.facebook.com → App Secret
INSTAGRAM_ACCOUNT_ID=         # ID numérico da conta Instagram Business
META_ACCESS_TOKEN=            # Token de longa duração (60 dias, renovar via cron)

# --- Telegram (Notificações) ---
TELEGRAM_BOT_TOKEN=           # @BotFather no Telegram → /newbot
TELEGRAM_CHAT_ID=             # ID do chat/grupo para receber notificações

# --- GCP (Infraestrutura) ---
GCP_PROJECT_ID=               # ID do projeto no Google Cloud
GCP_REGION=                   # ex: southamerica-east1 (São Paulo)
GCP_SERVICE_ACCOUNT_KEY=      # JSON da SA para Terraform (base64)
```

### Fluxo de prompts

Este projeto usa uma cadeia de prompts especializados:

| Prompt | Arquivo | Função |
|--------|---------|--------|
| 00 | Este documento | Contexto geral (NÃO executa nada) |
| 01 | `PROMPT_01_GERACAO.md` | Template enviado aos 3 LLMs para gerar resumos |
| 02 | `PROMPT_02_CONSOLIDACAO.md` | Template enviado ao Gemini Flash para consolidar |
| 03 | `PROMPT_03_DISTRIBUICAO.md` | Instruções de formatação para o post Instagram |

---

## ⚠️ INSTRUÇÃO FINAL

**Este prompt (00) é apenas para dar contexto. Você NÃO deve executar nenhuma ação agora.**

Quando o usuário enviar o **Prompt 01**, aí sim você deve começar a codar.

Confirme que entendeu o contexto respondendo apenas:
> "Contexto recebido. Aguardando Prompt 01 para iniciar a implementação."

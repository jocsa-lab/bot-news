# PROMPT 03 — Notificação, Imagem e Publicação no Instagram

## Objetivo

Criar os módulos de notificação (Telegram), geração de imagem (Puppeteer) e publicação no Instagram (Meta Graph API). Este prompt cobre todo o output do pipeline.

## O que implementar

### 1. Notificação via Telegram (`src/services/notification.service.ts`)

Usar a API do Telegram Bot diretamente (sem SDK):

```typescript
export async function notifyTelegram(data: {
  topic: string;
  titulo: string;
  resumo: string;      // primeiros 300 chars do texto final
  sheetRow: number;     // número da linha no Sheets
  contradictions: boolean;
}): Promise<void> {
  // POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage
  // chat_id: TELEGRAM_CHAT_ID
  // parse_mode: "HTML"
  // Incluir botões inline:
  //   ✅ Aprovar → callback que marca "pronto" no Sheets
  //   ✏️ Editar → link direto para a linha no Google Sheets
  //   ❌ Rejeitar → callback que marca "rejeitado"
  //
  // Formato da mensagem:
  // 📋 <b>Novo conteúdo gerado</b>
  // 📌 Tema: {topic}
  // ✍️ Título: {titulo}
  //
  // {resumo}...
  //
  // ⚠️ Contradições: {sim/não}
  // 📊 Linha: #{sheetRow}
}
```

**Webhook para callbacks do Telegram:**
- Criar endpoint `/webhook/telegram` no Cloud Run
- Processar callbacks de "Aprovar" e "Rejeitar"
- Ao aprovar: atualiza Sheets coluna H → "pronto", dispara geração de imagem + postagem
- Ao rejeitar: atualiza Sheets coluna H → "rejeitado", para o pipeline

### 2. Geração de Imagem (`src/services/image.service.ts`)

Usar Puppeteer para renderizar um template HTML como imagem PNG:

```typescript
export async function generatePostImage(data: {
  titulo: string;
  topicos: Array<{ emoji: string; titulo: string; conteudo: string }>;
  hashtags: string[];
}): Promise<Buffer> {
  // 1. Carregar template HTML de src/templates/post-template.html
  // 2. Injetar dados no template
  // 3. Renderizar com Puppeteer (headless)
  // 4. Screenshot como PNG 1080x1080 (formato Instagram quadrado)
  // 5. Retornar Buffer da imagem
}
```

**Template HTML (`src/templates/post-template.html`):**
- Dimensão: 1080x1080px
- Fundo: gradiente escuro moderno (ex: #0f0f23 → #1a1a3e)
- Título em destaque no topo (fonte bold, branca)
- Tópicos com emoji + texto (fonte menor, cinza claro)
- Logo/marca d'água no canto inferior
- Hashtags na parte inferior
- Usar Google Fonts (Inter ou similar) via @import
- Design limpo e moderno, legível no celular

**Para carrossel (múltiplas imagens):**
- Slide 1: Título + chamada
- Slides 2-N: Um tópico por slide
- Slide final: "Siga para mais" + hashtags
- Gerar cada slide como PNG separado

### 3. Publicação no Instagram (`src/services/instagram.service.ts`)

Usar a Meta Graph API v21.0 para publicar:

```typescript
export async function publishToInstagram(data: {
  imageBuffer: Buffer;    // ou array para carrossel
  caption: string;
  hashtags: string[];
}): Promise<{ postId: string }> {
  // PASSO 1: Upload da imagem para container
  // POST https://graph.facebook.com/v21.0/${INSTAGRAM_ACCOUNT_ID}/media
  // Body: {
  //   image_url: <URL pública da imagem>,
  //   caption: `${caption}\n\n${hashtags.join(' ')}`,
  //   access_token: META_ACCESS_TOKEN
  // }
  //
  // NOTA: A Meta exige URL pública para a imagem.
  // Opções:
  //   a) Upload temporário para GCS bucket público
  //   b) Upload para Imgur API (grátis)
  //   c) Servir temporariamente via Cloud Run endpoint
  //
  // PASSO 2: Publicar o container
  // POST https://graph.facebook.com/v21.0/${INSTAGRAM_ACCOUNT_ID}/media_publish
  // Body: { creation_id: <id do passo 1>, access_token: META_ACCESS_TOKEN }
}

// Para carrossel:
export async function publishCarousel(data: {
  images: Buffer[];
  caption: string;
  hashtags: string[];
}): Promise<{ postId: string }> {
  // 1. Upload cada imagem → array de creation_ids
  // 2. Criar container de carrossel com children = creation_ids
  // 3. Publicar o carrossel
}
```

**Upload temporário de imagem (via GCS):**
```typescript
// Criar bucket no Terraform: content-pipeline-temp-images
// Upload com signed URL (expira em 10 min)
// Após publicação, deletar a imagem do bucket
```

### 4. Orquestração pós-aprovação

Após o callback "Aprovar" do Telegram:

```typescript
export async function onApproval(sheetRow: number): Promise<void> {
  // 1. Ler dados consolidados do Sheets (coluna G)
  // 2. Gerar imagem(ns) do post
  // 3. Upload para GCS (URL temporária)
  // 4. Publicar no Instagram
  // 5. Atualizar Sheets: coluna H → "publicado", coluna I → post_id
  // 6. Deletar imagem do GCS
  // 7. Notificar sucesso no Telegram
  //
  // Se falhar em qualquer etapa:
  //   - Notificar erro no Telegram com detalhes
  //   - Atualizar Sheets: coluna H → "erro_publicacao"
  //   - Não deletar imagem do GCS (para debug)
}
```

### 5. Renovação do Meta Access Token

O token de longa duração da Meta expira em 60 dias. Criar job de renovação:

```typescript
export async function refreshMetaToken(): Promise<void> {
  // GET https://graph.facebook.com/v21.0/oauth/access_token
  //   ?grant_type=fb_exchange_token
  //   &client_id=${META_APP_ID}
  //   &client_secret=${META_APP_SECRET}
  //   &fb_exchange_token=${META_ACCESS_TOKEN}
  //
  // Atualizar secret no GCP Secret Manager
  // Rodar via Cloud Scheduler 1x por mês
}
```

---

## Entregáveis deste prompt

1. `src/services/notification.service.ts`
2. `src/services/image.service.ts`
3. `src/services/instagram.service.ts`
4. `src/templates/post-template.html`
5. Endpoint `/webhook/telegram` no entry point
6. Orquestrador `onApproval()`
7. Função de renovação do Meta token
8. Testes para cada service

Comece implementando. Após terminar, diga:
> "Prompt 03 concluído. Aguardando Prompt 04 para implementar Terraform e CI/CD."

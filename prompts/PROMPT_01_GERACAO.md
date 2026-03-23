# PROMPT 01 — Geração de Conteúdo (Template para os 3 LLMs)

## Objetivo

Criar o módulo de geração paralela que chama os 3 LLMs simultaneamente. Cada LLM recebe o mesmo prompt abaixo (com variações mínimas de instrução por modelo) e deve retornar um resumo estruturado.

## O que implementar

### 1. Clients de API (`src/clients/`)

**gemini.ts** — Client para Google AI Studio (Gemini 2.5 Pro)
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent`
- Habilitar thinking: `"generationConfig": { "thinkingConfig": { "thinkingBudget": 4096 } }`
- Auth: API key via query param `?key=${GEMINI_API_KEY}`
- Sem SDK externo — usar fetch nativo

**deepseek.ts** — Client para DeepSeek API (V3.2 reasoner)
- Endpoint: `https://api.deepinfra.com/v1/openai/chat/completions`
- Modelo: `deepseek-ai/DeepSeek-R1` via DeepInfra (ativa Chain-of-Thought thinking)
- Auth: Bearer token no header
- Formato OpenAI-compatible

**claude.ts** — Client para Anthropic API (Haiku 4.5)
- Endpoint: `https://api.anthropic.com/v1/messages`
- Modelo: `claude-haiku-4-5-20251001`
- Habilitar extended thinking: `"thinking": { "type": "enabled", "budget_tokens": 3072 }`
- Headers: `anthropic-version: 2023-06-01`, `x-api-key`

### 2. Template do prompt enviado a cada LLM

```typescript
export function buildGenerationPrompt(topic: string, date: string): string {
  return `
Você é um curador de conteúdo especializado em tecnologia e inovação.

## Tarefa
Gere um resumo informativo e preciso sobre o tema abaixo, focado nos acontecimentos e discussões mais relevantes de hoje.

## Tema
${topic}

## Data de referência
${date}

## Regras
1. Foque em FATOS verificáveis. Se não tiver certeza, omita.
2. Inclua de 3 a 5 pontos principais, cada um com 2-3 frases.
3. Use linguagem acessível mas precisa — público é brasileiro interessado em tech.
4. Escreva em português brasileiro.
5. Não invente dados, números ou citações.
6. Se um ponto for uma opinião de mercado, sinalize como tal.
7. Ao final, liste de 1 a 3 fontes/referências se possível.

## Formato de saída
Retorne APENAS um JSON válido, sem markdown:
{
  "pontos": [
    {
      "titulo": "string (max 10 palavras)",
      "resumo": "string (2-3 frases)",
      "tipo": "fato" | "tendencia" | "opiniao"
    }
  ],
  "fontes": ["string"],
  "confianca": "alta" | "media" | "baixa"
}
`;
}
```

### 3. Service de geração (`src/services/generation.service.ts`)

```typescript
// Pseudocódigo do fluxo
export async function generateFromAllSources(topic: string): Promise<GenerationResult> {
  const date = new Date().toISOString().split('T')[0];
  const prompt = buildGenerationPrompt(topic, date);

  // Chamadas paralelas — todas ao mesmo tempo
  const [gemini, deepseek, claude] = await Promise.allSettled([
    geminiClient.generate(prompt),
    deepseekClient.generate(prompt),
    claudeClient.generate(prompt),
  ]);

  // Parse e validação de cada resultado
  // Se um falhar, continua com os outros 2
  // Salva no Google Sheets (uma coluna por fonte)

  return {
    gemini: parseResult(gemini),
    deepseek: parseResult(deepseek),
    claude: parseResult(claude),
    timestamp: new Date().toISOString(),
  };
}
```

### 4. Tratamento de erros

- Se 1 de 3 falhar: continua com 2 fontes (log warning)
- Se 2 de 3 falharem: continua com 1 fonte (log error, flag no Sheets)
- Se todos falharem: notifica erro via Telegram, não salva no Sheets
- Timeout de 30s por chamada
- Retry: 1 tentativa com backoff de 2s

### 5. Salvamento no Google Sheets

Usar Google Sheets API v4 com service account:
- Coluna A: Data/hora
- Coluna B: Tema
- Coluna C: Resultado Gemini (JSON stringificado)
- Coluna D: Resultado DeepSeek (JSON stringificado)
- Coluna E: Resultado Claude (JSON stringificado)
- Coluna F: Status → "gerado"
- Coluna G: (reservada para texto consolidado — Prompt 02)
- Coluna H: (reservada para status final — "pronto" / "rejeitado")

---

## Entregáveis deste prompt

1. `src/clients/gemini.ts`
2. `src/clients/deepseek.ts`
3. `src/clients/claude.ts`
4. `src/clients/sheets.ts`
5. `src/prompts/prompt-01-geracao.ts`
6. `src/services/generation.service.ts`
7. `src/utils/config.ts` (centraliza env vars com validação)
8. Testes unitários básicos para cada client

Comece implementando. Após terminar, diga:
> "Prompt 01 concluído. Aguardando Prompt 02 para implementar a consolidação."

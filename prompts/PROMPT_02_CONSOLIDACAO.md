# PROMPT 02 — Consolidação de Conteúdo (Gemini 2.5 Flash)

## Objetivo

Criar o módulo que recebe os 3 resumos gerados no Prompt 01 e usa o Gemini 2.5 Flash (grátis) para consolidar tudo em um texto final fluido, organizado em tópicos, pronto para consumo.

## O que implementar

### 1. Template do prompt de consolidação

```typescript
export function buildConsolidationPrompt(
  geminiResult: string,
  deepseekResult: string,
  claudeResult: string,
  topic: string
): string {
  return `
Você é um editor-chefe de um canal de tecnologia no Instagram. Sua especialidade é transformar informações brutas em conteúdo envolvente e preciso.

## Tarefa
Você recebeu 3 resumos independentes sobre o mesmo tema, gerados por fontes diferentes. Seu trabalho é:

1. **Cruzar fatos**: Se 2 ou 3 fontes concordam, o fato é confiável. Se apenas 1 menciona algo, sinalize com cautela.
2. **Eliminar redundâncias**: Não repita a mesma informação com palavras diferentes.
3. **Detectar contradições**: Se as fontes divergem, apresente ambos os lados.
4. **Gerar texto fluido**: O resultado final deve parecer escrito por um humano, não montado por IA. Organize em tópicos claros com transições naturais.

## Tema
${topic}

## Fonte 1 (Gemini)
${geminiResult}

## Fonte 2 (DeepSeek)
${deepseekResult}

## Fonte 3 (Claude)
${claudeResult}

## Regras de formatação
- Escreva em português brasileiro
- Use 3 a 6 tópicos, cada um com título curto + 2 a 4 frases
- Tom: informativo mas acessível, como se explicasse para um amigo esperto
- Inclua emojis relevantes nos títulos (1 por tópico, no início)
- No final, adicione uma seção "🔍 Para ficar de olho" com 1-2 frases sobre o que acompanhar nos próximos dias
- Tamanho total: entre 800 e 1500 caracteres (limite do Instagram para leitura confortável em carrossel)

## Formato de saída
Retorne APENAS um JSON válido, sem markdown:
{
  "titulo_post": "string (max 60 chars, chamativo para Instagram)",
  "texto_final": "string (texto completo formatado com quebras de linha)",
  "hashtags": ["string (5 a 8 hashtags relevantes)"],
  "topicos": [
    {
      "emoji": "string",
      "titulo": "string",
      "conteudo": "string"
    }
  ],
  "ficar_de_olho": "string",
  "total_caracteres": number,
  "fontes_concordantes": number,
  "contradicoes_encontradas": boolean
}
`;
}
```

### 2. Client Gemini Flash (`src/clients/gemini.ts` — adicionar método)

Reaproveitar o client do Gemini criado no Prompt 01, adicionando:
- Modelo: `gemini-2.5-flash`
- Thinking habilitado mas com budget menor (2048 tokens — economiza free tier)
- Mesmo endpoint, só muda o model name na URL

```typescript
// Adicionar ao gemini.ts existente
export async function consolidate(prompt: string): Promise<string> {
  // Usa gemini-2.5-flash em vez de gemini-2.5-pro
  // thinkingBudget: 2048 (suficiente para consolidação)
}
```

### 3. Service de consolidação (`src/services/consolidation.service.ts`)

```typescript
export async function consolidateContent(row: SheetRow): Promise<ConsolidationResult> {
  // 1. Lê os 3 JSONs do Sheets (colunas C, D, E)
  // 2. Monta o prompt de consolidação
  // 3. Chama Gemini Flash
  // 4. Valida o JSON de retorno
  // 5. Salva na coluna G do Sheets
  // 6. Atualiza status na coluna F para "consolidado"
  // 7. Dispara notificação (Prompt 03)

  // Fallback: se Gemini Flash falhar, tentar com DeepSeek (barato)
}
```

### 4. Validação do output

O JSON retornado deve ser validado:
- `total_caracteres` entre 800 e 1500
- `hashtags` entre 5 e 8
- `topicos` entre 3 e 6
- Se fora dos limites, fazer UMA chamada de correção pedindo ajuste

### 5. Atualização do Google Sheets

Após consolidação bem-sucedida:
- Coluna G: JSON do resultado consolidado
- Coluna F: status atualizado para `"consolidado"`
- Timestamp da consolidação em coluna auxiliar

---

## Entregáveis deste prompt

1. `src/prompts/prompt-02-consolidacao.ts`
2. `src/services/consolidation.service.ts`
3. Atualização do `src/clients/gemini.ts` com método `consolidate()`
4. Testes para o service de consolidação

Comece implementando. Após terminar, diga:
> "Prompt 02 concluído. Aguardando Prompt 03 para implementar notificação e distribuição."

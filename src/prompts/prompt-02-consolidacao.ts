export function buildConsolidationPrompt(
  geminiResult: string,
  deepseekResult: string,
  claudeResult: string,
  topic: string,
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

export function buildCorrectionPrompt(json: string, issues: string[]): string {
  return `
O JSON abaixo precisa de ajustes. Corrija APENAS os problemas listados e retorne o JSON corrigido (sem markdown):

## Problemas
${issues.map((i) => `- ${i}`).join('\n')}

## JSON original
${json}

Retorne APENAS o JSON corrigido, sem explicações.
`;
}

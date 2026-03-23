export interface Ponto {
  titulo: string;
  resumo: string;
  tipo: 'fato' | 'tendencia' | 'opiniao';
}

export interface LLMResponse {
  pontos: Ponto[];
  fontes: string[];
  confianca: 'alta' | 'media' | 'baixa';
}

export interface SourceResult {
  success: boolean;
  data?: LLMResponse;
  error?: string;
  source: 'gemini' | 'deepseek' | 'claude';
}

export interface GenerationResult {
  gemini: SourceResult;
  deepseek: SourceResult;
  claude: SourceResult;
  timestamp: string;
}

export interface ConsolidationTopico {
  emoji: string;
  titulo: string;
  conteudo: string;
}

export interface ConsolidationResult {
  titulo_post: string;
  texto_final: string;
  hashtags: string[];
  topicos: ConsolidationTopico[];
  ficar_de_olho: string;
  total_caracteres: number;
  fontes_concordantes: number;
  contradicoes_encontradas: boolean;
}

export interface TelegramCallbackData {
  action: 'approve' | 'reject';
  contentId: string;
}

export interface CarouselSlide {
  type: 'cover' | 'topic' | 'closing';
  titulo?: string;
  emoji?: string;
  conteudo?: string;
  hashtags?: string[];
}

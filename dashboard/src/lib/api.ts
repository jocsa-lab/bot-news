export interface ContentDoc {
  _id: string;
  date: string;
  topic: string;
  timestamp: string;
  gemini: unknown;
  deepseek: unknown;
  claude: unknown;
  status: string;
  consolidatedJson?: string;
  postId?: string;
}

const BASE = import.meta.env.DEV ? '' : '/dashboard/..';

function headers(): HeadersInit {
  const token = sessionStorage.getItem('auth_token');
  return token ? { Authorization: `Basic ${token}` } : {};
}

export async function fetchContents(limit = 100, includeDeleted = false): Promise<ContentDoc[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (includeDeleted) params.set('includeDeleted', 'true');
  const res = await fetch(`/api/contents?${params}`, { headers: headers() });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('Erro ao carregar');
  return res.json();
}

export async function deleteContent(id: string): Promise<void> {
  const res = await fetch(`/api/contents/${id}/delete`, {
    method: 'PATCH',
    headers: headers(),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('Erro ao apagar');
}

export async function generateContent(topic: string, range: string): Promise<{ success: boolean; sources: number; consolidated: number }> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, range }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(data.error || 'Erro ao gerar conteudo');
  }
  return res.json();
}

export async function approveContent(id: string): Promise<void> {
  const res = await fetch(`/api/contents/${id}/approve`, {
    method: 'POST',
    headers: headers(),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('Erro ao aprovar');
}

export function setAuth(user: string, pass: string) {
  sessionStorage.setItem('auth_token', btoa(`${user}:${pass}`));
}

export function clearAuth() {
  sessionStorage.removeItem('auth_token');
}

export function isAuthenticated(): boolean {
  return !!sessionStorage.getItem('auth_token');
}

import type { ContentDoc } from '../lib/api';
import StatusBadge from './StatusBadge';

interface Props {
  doc: ContentDoc;
  onDelete: (id: string) => void;
}

function sourceOk(val: unknown): boolean {
  return !(typeof val === 'string' && val.startsWith('ERRO:'));
}

function getTitulo(doc: ContentDoc): string | null {
  if (!doc.consolidatedJson) return null;
  try {
    return JSON.parse(doc.consolidatedJson).titulo_post;
  } catch {
    return null;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function ContentCard({ doc, onDelete }: Props) {
  const titulo = getTitulo(doc);
  const canDelete = !['apagado', 'publicado'].includes(doc.status);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-colors">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-slate-100 truncate">{doc.topic}</p>
          <p className="text-xs text-slate-500 mt-0.5">{formatDate(doc.timestamp)}</p>
        </div>
        <StatusBadge status={doc.status} />
      </div>

      {/* Body */}
      <div className="px-4 pb-3 space-y-2.5">
        {/* Sources */}
        <div className="flex gap-1.5">
          {(['gemini', 'deepseek', 'claude'] as const).map((name) => {
            const ok = sourceOk(doc[name]);
            return (
              <span
                key={name}
                className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  ok ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
                }`}
              >
                {name.charAt(0).toUpperCase() + name.slice(1)}
              </span>
            );
          })}
        </div>

        {/* Titulo */}
        {titulo && (
          <div className="text-sm text-slate-300 bg-slate-950 rounded-lg px-3 py-2 border-l-2 border-blue-500">
            {titulo}
          </div>
        )}

        {/* Post ID */}
        {doc.postId && (
          <p className="text-xs text-slate-500">Post ID: {doc.postId}</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 bg-slate-950/50 border-t border-slate-800 flex items-center justify-between">
        <span className="text-[11px] text-slate-600">{doc.date}</span>
        {canDelete && (
          <button
            onClick={() => onDelete(doc._id)}
            className="text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/50 hover:bg-red-900/50 px-3 py-1 rounded-md transition-colors"
          >
            Apagar
          </button>
        )}
      </div>
    </div>
  );
}

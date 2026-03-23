import { useCallback, useEffect, useState } from 'react';
import type { ContentDoc } from '../lib/api';
import { fetchContents, deleteContent as apiDelete, clearAuth } from '../lib/api';
import ContentCard from './ContentCard';
import StatusBadge from './StatusBadge';

const ALL_STATUSES = ['gerado', 'consolidado', 'pronto', 'publicado', 'rejeitado', 'apagado', 'erro_publicacao'];

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<ContentDoc[]>([]);
  const [filter, setFilter] = useState('todos');
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const docs = await fetchContents(100, showDeleted);
      setData(docs);
    } catch (e: any) {
      if (e.message === 'unauthorized') {
        clearAuth();
        onLogout();
        return;
      }
      showToast('Erro ao carregar dados', true);
    } finally {
      setLoading(false);
    }
  }, [showDeleted, onLogout]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja apagar este conteudo?')) return;
    try {
      await apiDelete(id);
      showToast('Conteudo apagado');
      load();
    } catch (e: any) {
      if (e.message === 'unauthorized') { clearAuth(); onLogout(); return; }
      showToast('Erro ao apagar', true);
    }
  }

  function handleLogout() {
    clearAuth();
    onLogout();
  }

  const filtered = filter === 'todos' ? data : data.filter((d) => d.status === filter);
  const counts: Record<string, number> = { todos: data.length };
  data.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });

  const totalPub = counts['publicado'] || 0;
  const totalPending = (counts['gerado'] || 0) + (counts['consolidado'] || 0) + (counts['pronto'] || 0);
  const totalErrors = counts['erro_publicacao'] || 0;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-100">Bot News Dashboard</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            Mostrar apagados
          </label>
          <button onClick={load} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors">
            Atualizar
          </button>
          <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Sair
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex gap-2 flex-wrap">
        {['todos', ...ALL_STATUSES].map((s) => {
          const count = counts[s] || 0;
          if (s !== 'todos' && count === 0) return null;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === s
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-transparent border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
            >
              {s === 'todos' ? 'Todos' : <StatusBadge status={s} />} ({count})
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="px-6 py-4 flex gap-4 flex-wrap">
        <StatCard label="Total" value={data.length} />
        <StatCard label="Publicados" value={totalPub} color="text-green-400" />
        <StatCard label="Pendentes" value={totalPending} color="text-amber-400" />
        {totalErrors > 0 && <StatCard label="Erros" value={totalErrors} color="text-red-400" />}
      </div>

      {/* Content */}
      <div className="px-6 pb-8">
        {loading ? (
          <p className="text-center text-slate-500 py-16">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-500 py-16">Nenhum conteudo encontrado</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((doc) => (
              <ContentCard key={doc._id} doc={doc} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 px-5 py-3 rounded-lg text-sm font-medium text-white shadow-lg transition-opacity z-50 ${
            toast.error ? 'bg-red-600' : 'bg-green-600'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 min-w-[120px]">
      <p className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color ?? 'text-slate-100'}`}>{value}</p>
    </div>
  );
}

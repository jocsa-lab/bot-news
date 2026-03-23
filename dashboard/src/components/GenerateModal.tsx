import { useState } from 'react';

interface Props {
  onClose: () => void;
  onGenerate: (topic: string, range: string) => void;
  loading: boolean;
}

const RANGES = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
];

export default function GenerateModal({ onClose, onGenerate, loading }: Props) {
  const [topic, setTopic] = useState('tecnologia e inovacao');
  const [range, setRange] = useState('hoje');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    onGenerate(topic.trim(), range);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-slate-800">
          <h2 className="text-lg font-bold text-slate-100">Gerar Noticia</h2>
          <p className="text-xs text-slate-500 mt-1">Escolha o tema e o periodo de pesquisa</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Tema / Categoria</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: inteligencia artificial, ciberseguranca..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              disabled={loading}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Periodo</label>
            <div className="flex gap-2">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRange(r.value)}
                  disabled={loading}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    range === r.value
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !topic.trim()}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Gerando...' : 'Gerar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

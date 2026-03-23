const COLORS: Record<string, string> = {
  gerado: 'bg-blue-900/60 text-blue-300',
  consolidado: 'bg-amber-900/60 text-amber-300',
  pronto: 'bg-orange-900/60 text-orange-300',
  publicado: 'bg-green-900/60 text-green-300',
  rejeitado: 'bg-slate-700 text-slate-400',
  apagado: 'bg-slate-800 text-slate-500',
  erro_publicacao: 'bg-red-900/60 text-red-300',
};

const LABELS: Record<string, string> = {
  gerado: 'Gerado',
  consolidado: 'Consolidado',
  pronto: 'Pronto',
  publicado: 'Publicado',
  rejeitado: 'Rejeitado',
  apagado: 'Apagado',
  erro_publicacao: 'Erro',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${COLORS[status] ?? 'bg-slate-700 text-slate-400'}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}

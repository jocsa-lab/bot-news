export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bot News Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }

  .header { background: #1e293b; padding: 20px 24px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 20px; font-weight: 600; }
  .header-actions { display: flex; gap: 8px; }
  .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.15s; }
  .btn-refresh { background: #3b82f6; color: #fff; }
  .btn-refresh:hover { background: #2563eb; }
  .btn-delete { background: #dc2626; color: #fff; font-size: 12px; padding: 4px 10px; }
  .btn-delete:hover { background: #b91c1c; }
  .btn-delete:disabled { background: #4b5563; cursor: not-allowed; }

  .filters { background: #1e293b; padding: 12px 24px; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid #334155; }
  .filter-btn { padding: 6px 14px; border-radius: 20px; border: 1px solid #475569; background: transparent; color: #94a3b8; cursor: pointer; font-size: 12px; transition: all 0.15s; }
  .filter-btn:hover { border-color: #64748b; color: #e2e8f0; }
  .filter-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }

  .stats { display: flex; gap: 16px; padding: 16px 24px; flex-wrap: wrap; }
  .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px 16px; min-width: 120px; }
  .stat-card .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-card .value { font-size: 24px; font-weight: 700; margin-top: 4px; }

  .container { padding: 16px 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; }

  .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; overflow: hidden; transition: border-color 0.15s; }
  .card:hover { border-color: #475569; }
  .card-header { padding: 14px 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .card-topic { font-weight: 600; font-size: 14px; }
  .card-body { padding: 0 16px 14px; }
  .card-footer { padding: 10px 16px; background: #0f172a; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #334155; }

  .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  .badge-gerado { background: #1e40af; color: #93c5fd; }
  .badge-consolidado { background: #92400e; color: #fcd34d; }
  .badge-pronto { background: #9a3412; color: #fdba74; }
  .badge-publicado { background: #166534; color: #86efac; }
  .badge-rejeitado { background: #374151; color: #9ca3af; }
  .badge-apagado { background: #1f2937; color: #6b7280; }
  .badge-erro_publicacao { background: #991b1b; color: #fca5a5; }

  .meta-row { display: flex; gap: 16px; font-size: 12px; color: #94a3b8; margin-bottom: 8px; }
  .meta-row span { display: flex; align-items: center; gap: 4px; }

  .sources { display: flex; gap: 6px; margin-top: 8px; }
  .source-tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
  .source-ok { background: #064e3b; color: #6ee7b7; }
  .source-err { background: #7f1d1d; color: #fca5a5; }

  .titulo { font-size: 13px; color: #cbd5e1; margin-top: 8px; padding: 8px; background: #0f172a; border-radius: 6px; border-left: 3px solid #3b82f6; }

  .empty { text-align: center; padding: 60px 24px; color: #64748b; }
  .empty p { font-size: 16px; }

  .loading { text-align: center; padding: 60px; color: #64748b; }

  .toast { position: fixed; bottom: 20px; right: 20px; background: #22c55e; color: #fff; padding: 12px 20px; border-radius: 8px; font-size: 13px; font-weight: 500; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 100; }
  .toast.show { opacity: 1; }
  .toast.error { background: #ef4444; }

  @media (max-width: 480px) {
    .grid { grid-template-columns: 1fr; }
    .stats { flex-direction: column; }
    .header { flex-direction: column; gap: 12px; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>Bot News Dashboard</h1>
    <div class="header-actions">
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8;cursor:pointer;">
        <input type="checkbox" id="showDeleted" onchange="loadContents()"> Mostrar apagados
      </label>
      <button class="btn btn-refresh" onclick="loadContents()">Atualizar</button>
    </div>
  </div>

  <div class="filters" id="filters"></div>
  <div class="stats" id="stats"></div>
  <div class="container">
    <div id="content" class="loading">Carregando...</div>
  </div>
  <div class="toast" id="toast"></div>

<script>
let allData = [];
let activeFilter = 'todos';

const STATUS_LABELS = {
  gerado: 'Gerado',
  consolidado: 'Consolidado',
  pronto: 'Pronto',
  publicado: 'Publicado',
  rejeitado: 'Rejeitado',
  apagado: 'Apagado',
  erro_publicacao: 'Erro',
};

function toast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => el.className = 'toast', 3000);
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function sourceStatus(val) {
  if (typeof val === 'string' && val.startsWith('ERRO:')) return { ok: false, msg: val };
  return { ok: true };
}

function getTitulo(doc) {
  if (!doc.consolidatedJson) return null;
  try { return JSON.parse(doc.consolidatedJson).titulo_post; } catch { return null; }
}

function renderFilters() {
  const counts = { todos: allData.length };
  allData.forEach(d => { counts[d.status] = (counts[d.status] || 0) + 1; });

  const el = document.getElementById('filters');
  el.innerHTML = Object.entries({ todos: 'Todos', ...STATUS_LABELS })
    .map(([key, label]) => {
      const count = counts[key] || 0;
      if (key !== 'todos' && count === 0) return '';
      return '<button class="filter-btn' + (activeFilter === key ? ' active' : '') +
        '" onclick="setFilter(\\'' + key + '\\')">' + label + ' (' + count + ')</button>';
    }).join('');
}

function renderStats() {
  const total = allData.length;
  const pub = allData.filter(d => d.status === 'publicado').length;
  const pending = allData.filter(d => ['gerado','consolidado','pronto'].includes(d.status)).length;
  const errors = allData.filter(d => d.status === 'erro_publicacao').length;

  document.getElementById('stats').innerHTML =
    '<div class="stat-card"><div class="label">Total</div><div class="value">' + total + '</div></div>' +
    '<div class="stat-card"><div class="label">Publicados</div><div class="value" style="color:#22c55e">' + pub + '</div></div>' +
    '<div class="stat-card"><div class="label">Pendentes</div><div class="value" style="color:#f59e0b">' + pending + '</div></div>' +
    (errors > 0 ? '<div class="stat-card"><div class="label">Erros</div><div class="value" style="color:#ef4444">' + errors + '</div></div>' : '');
}

function renderCards() {
  const filtered = activeFilter === 'todos' ? allData : allData.filter(d => d.status === activeFilter);
  const el = document.getElementById('content');

  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty"><p>Nenhum conteudo encontrado</p></div>';
    return;
  }

  el.innerHTML = '<div class="grid">' + filtered.map(doc => {
    const id = doc._id;
    const titulo = getTitulo(doc);
    const gemini = sourceStatus(doc.gemini);
    const deepseek = sourceStatus(doc.deepseek);
    const claude = sourceStatus(doc.claude);
    const canDelete = !['apagado', 'publicado'].includes(doc.status);

    return '<div class="card">' +
      '<div class="card-header">' +
        '<div><div class="card-topic">' + escHtml(doc.topic) + '</div>' +
          '<div class="meta-row"><span>' + formatDate(doc.timestamp) + '</span></div>' +
        '</div>' +
        '<span class="badge badge-' + doc.status + '">' + (STATUS_LABELS[doc.status] || doc.status) + '</span>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="sources">' +
          '<span class="source-tag ' + (gemini.ok ? 'source-ok' : 'source-err') + '">Gemini</span>' +
          '<span class="source-tag ' + (deepseek.ok ? 'source-ok' : 'source-err') + '">DeepSeek</span>' +
          '<span class="source-tag ' + (claude.ok ? 'source-ok' : 'source-err') + '">Claude</span>' +
        '</div>' +
        (titulo ? '<div class="titulo">' + escHtml(titulo) + '</div>' : '') +
        (doc.postId ? '<div class="meta-row" style="margin-top:8px"><span>Post ID: ' + escHtml(doc.postId) + '</span></div>' : '') +
      '</div>' +
      '<div class="card-footer">' +
        '<span style="font-size:11px;color:#64748b">' + doc.date + '</span>' +
        (canDelete ? '<button class="btn btn-delete" onclick="deleteContent(\\'' + id + '\\')">Apagar</button>' : '<span></span>') +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function setFilter(f) {
  activeFilter = f;
  renderFilters();
  renderCards();
}

async function loadContents() {
  try {
    const showDeleted = document.getElementById('showDeleted').checked;
    const res = await fetch('/api/contents?limit=100' + (showDeleted ? '&includeDeleted=true' : ''));
    if (!res.ok) throw new Error('Erro ao carregar');
    allData = await res.json();
    renderFilters();
    renderStats();
    renderCards();
  } catch (e) {
    document.getElementById('content').innerHTML = '<div class="empty"><p>Erro ao carregar dados</p></div>';
    toast(e.message, true);
  }
}

async function deleteContent(id) {
  if (!confirm('Tem certeza que deseja apagar este conteudo?')) return;
  try {
    const res = await fetch('/api/contents/' + id + '/delete', { method: 'PATCH' });
    if (!res.ok) throw new Error('Erro ao apagar');
    toast('Conteudo apagado');
    loadContents();
  } catch (e) {
    toast(e.message, true);
  }
}

loadContents();
setInterval(loadContents, 60000);
</script>
</body>
</html>`;

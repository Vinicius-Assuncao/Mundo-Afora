const KEY = 'mundo-afora.v1';
const $ = (s) => document.querySelector(s);

const EMOJIS = ['🌍','✈️','🏖️','🏔️','🏙️','🗺️','🚗','🚆','⛵','🏕️','🍷','🎒','📸','🌅','🌴','🏛️','🎡','🌋','🐋','🛶','🍜','🌸','❄️','🌵'];
const COLORS = ['#2f5d8a','#4a6fa5','#1f5f6b','#3d7a4f','#6b8e4e','#8b5e3c','#a0522d','#9a6b1f','#5c4033','#1a1a1a'];
const MODES = {
  walk: { profile: 'foot-walking', label: 'A pé' },
  bike: { profile: 'cycling-regular', label: 'Bicicleta' },
  car:  { profile: 'driving-car', label: 'Carro' },
};

let db = JSON.parse(localStorage.getItem(KEY) || 'null') || { trips: [], currentId: null };
let dayIdx = 0, overview = false, lastResults = [], editingId = null, pickedEmoji = '🌍';
let map, layer;

// ---------- utilidades ----------
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const uid = () => Math.random().toString(36).slice(2, 10);
const cur = () => db.trips.find((t) => t.id === db.currentId);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fmt = (min) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`;
const hasKey = () => CONFIG.ORS_KEY;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 3500);
}
function fmtDate(iso) {
  return new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
function dateRange(t) {
  return t.start ? `${fmtDate(t.start)} – ${fmtDate(t.end || t.start)}` : 'Sem datas definidas';
}
function isoRange(start, end) {
  if (!start) return [];
  const out = [], d = new Date(start + 'T12:00'), e = new Date((end || start) + 'T12:00');
  while (d <= e && out.length < 60) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return out;
}
function newDay(i, date = null) {
  return { id: uid(), name: `Dia ${i + 1}`, date, color: COLORS[i % COLORS.length], stops: [] };
}

// ---------- APIs ----------
async function ors(mode, a, b) {
  if (!hasKey()) throw new Error('Configure a chave em config.js para calcular trajetos.');
  const r = await fetch(`https://api.openrouteservice.org/v2/directions/${MODES[mode].profile}/geojson`, {
    method: 'POST',
    headers: { Authorization: CONFIG.ORS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: [[a.lon, a.lat], [b.lon, b.lat]] }),
  });
  if (!r.ok) throw new Error(`Não foi possível calcular o trajeto (HTTP ${r.status}).`);
  const f = (await r.json()).features[0];
  return {
    geo: f.geometry.coordinates.map((c) => [c[1], c[0]]),
    min: f.properties.summary.duration / 60,
    km: f.properties.summary.distance / 1000,
  };
}
async function searchPlaces(q) {
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=pt-BR&q=' + encodeURIComponent(q));
  if (!r.ok) throw new Error('Busca indisponível no momento.');
  return (await r.json()).map((p) => ({
    name: p.name || p.display_name.split(',')[0], lat: +p.lat, lon: +p.lon, address: p.display_name,
  }));
}
async function wikiInfo(name) {
  try {
    const r = await fetch('https://pt.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(name));
    if (!r.ok) return null;
    const j = await r.json();
    return { desc: (j.extract || '').slice(0, 400), photo: j.thumbnail?.source || '', url: j.content_urls?.desktop?.page || '' };
  } catch { return null; }
}

// ---------- trajetos ----------
async function legFor(d, i) {
  const a = d.stops[i - 1], b = d.stops[i];
  const r = await ors(b.transport || 'walk', a, b);
  Object.assign(b, { legMin: r.min, legKm: r.km, legGeo: r.geo });
}
async function routeDay(d) {
  for (let i = 1; i < d.stops.length; i++) await legFor(d, i);
}
function clearLeg(s) { Object.assign(s, { legMin: null, legKm: null, legGeo: null }); }
function fixLegs(d) { if (d.stops[0]) clearLeg(d.stops[0]); }

async function withBusy(fn) {
  try { await fn(); } catch (e) { toast(e.message || 'Erro ao calcular trajeto.'); }
  save(); renderTrip();
}
// recalcula dias quando há mudança de ordem/remoção; sem chave, só marca como pendente
function reroute(...days) {
  if (!hasKey()) { save(); renderTrip(); return; }
  return withBusy(async () => { for (const d of days) await routeDay(d); });
}

function warnings(d) {
  const set = new Set();
  for (let i = 1; i < d.stops.length; i++) {
    const a = d.stops[i - 1], b = d.stops[i];
    if (a.time && b.time && b.legMin != null) {
      if (toMin(a.time) + (+a.stay || 0) + b.legMin > toMin(b.time)) set.add(i);
    }
  }
  return set;
}

async function enrich(stop) {
  const w = await wikiInfo(stop.name);
  if (w) Object.assign(stop, w);
}

// ---------- telas ----------
function show(view) {
  $('#home').classList.toggle('hidden', view !== 'home');
  $('#trip').classList.toggle('hidden', view !== 'trip');
  $('#backBtn').classList.toggle('hidden', view === 'home');
  $('#editTripBtn').classList.toggle('hidden', view !== 'trip');
  $('#exportBtn').classList.toggle('hidden', view !== 'trip');
  if (view === 'home') $('#topTitle').textContent = '';
}
function goHome() { show('home'); renderHome(); }
function openTrip(id) {
  db.currentId = id; dayIdx = 0; overview = false; save();
  show('trip');
  map.invalidateSize();
  renderTrip();
}

function renderHome() {
  $('#tripCards').innerHTML = db.trips.map((t) => {
    const stops = t.days.reduce((s, d) => s + d.stops.length, 0);
    const c1 = t.days[0]?.color || COLORS[0];
    const c2 = t.days[t.days.length - 1]?.color || COLORS[3];
    return `
    <article class="card trip-card" data-id="${t.id}" style="--c:${c1};--c2:${c2}">
      <div class="band"></div>
      <button class="btn edit" data-edit="${t.id}" aria-label="Editar viagem">Editar</button>
      <div class="emoji">${esc(t.emoji || '🌍')}</div>
      <h3>${esc(t.name)}</h3>
      <p class="dates">${dateRange(t)}</p>
      <div class="meta"><span class="chip">${t.days.length} dias</span><span class="chip">${stops} paradas</span></div>
    </article>`;
  }).join('') || `<div class="empty"><div class="big-emoji">🧭</div><p>Nenhuma viagem ainda. Crie a primeira!</p></div>`;
}

function renderTrip() {
  const t = cur();
  if (!t) return goHome();
  if (dayIdx >= t.days.length) dayIdx = 0;
  $('#topTitle').textContent = `${t.emoji || '🌍'} ${t.name}`;
  renderDaysNav(t);
  $('#recalcDay').classList.toggle('hidden', overview);
  $('#searchForm').classList.toggle('hidden', overview);
  $('#results').classList.toggle('hidden', overview);
  $('.ideas').classList.toggle('hidden', overview);
  $('#stops').classList.toggle('hidden', overview);
  $('#overviewDays').classList.toggle('hidden', !overview);
  if (overview) {
    renderOverview(t);
    $('#stops').innerHTML = '';
  } else {
    renderDayHead(t);
    renderSummary(t);
    renderStops(t);
    renderIdeas(t);
  }
  drawMap(t);
}

function renderDaysNav(t) {
  $('#daysNav').innerHTML = `
    <button class="tab overview-tab ${overview ? 'on' : ''}" data-act="overview" style="--c:var(--azul)" aria-pressed="${overview}">
      <b>Visão geral</b><small>Toda a viagem</small>
    </button>` + t.days.map((d, i) => `
    <button class="tab ${!overview && i === dayIdx ? 'on' : ''}" data-i="${i}" style="--c:${d.color}" aria-pressed="${!overview && i === dayIdx}">
      <b>${esc(d.name)}</b><small>${d.date ? fmtDate(d.date) : 'sem data'}</small>
    </button>`).join('') + `<button class="tab add" data-act="addDay">+ Dia</button>`;
}

function renderOverview(t) {
  const totals = t.days.reduce((sum, d) => {
    sum.stops += d.stops.length;
    for (const stop of d.stops) {
      sum.visit += +stop.stay || 0;
      sum.drive += stop.legMin || 0;
      sum.km += stop.legKm || 0;
    }
    return sum;
  }, { stops: 0, visit: 0, drive: 0, km: 0 });

  $('#dayHead').innerHTML = '<div class="dh"><h2>Visão geral da viagem</h2></div>';
  $('#summary').innerHTML = `
    <span class="chip">${t.days.length} dias</span>
    <span class="chip">${totals.stops} paradas</span>
    <span class="chip">Visitas: ${fmt(totals.visit)}</span>
    <span class="chip">Deslocamento: ${fmt(totals.drive)}</span>
    <span class="chip">${totals.km.toFixed(1)} km</span>`;
  $('#overviewDays').innerHTML = t.days.map((d, i) => {
    const visit = d.stops.reduce((sum, stop) => sum + (+stop.stay || 0), 0);
    const drive = d.stops.reduce((sum, stop) => sum + (stop.legMin || 0), 0);
    const km = d.stops.reduce((sum, stop) => sum + (stop.legKm || 0), 0);
    return `
      <article class="overview-day" style="--c:${d.color}">
        <div class="overview-day-head">
          <h3>${esc(d.name)}</h3>
          <small>${d.date ? fmtDate(d.date) : 'sem data'}</small>
        </div>
        <div class="summary">
          <span class="chip">${d.stops.length} paradas</span>
          <span class="chip">Visitas: ${fmt(visit)}</span>
          <span class="chip">Deslocamento: ${fmt(drive)}</span>
          <span class="chip">${km.toFixed(1)} km</span>
        </div>
        ${d.stops.length
          ? `<ol>${d.stops.map((stop, j) => `<li><span class="num" style="--c:${d.color}">${j + 1}</span>${esc(stop.name)}</li>`).join('')}</ol>`
          : '<p class="empty-line">Nenhuma parada neste dia.</p>'}
        <button class="btn sm" data-day="${i}">Abrir dia</button>
      </article>`;
  }).join('');
}

function renderDayHead(t) {
  const d = t.days[dayIdx];
  $('#dayHead').innerHTML = `
    <div class="dh">
      <input id="dayName" value="${esc(d.name)}" aria-label="Nome do dia">
      <button class="btn sm ghost danger" data-act="delDay">Excluir</button>
    </div>
    <div class="swatches" style="margin-top:10px">
      ${COLORS.map((c) => `<button class="sw ${c === d.color ? 'on' : ''}" style="background:${c}" data-color="${c}" aria-label="Cor"></button>`).join('')}
    </div>`;
}

function renderSummary(t) {
  const d = t.days[dayIdx];
  const visit = d.stops.reduce((s, x) => s + (+x.stay || 0), 0);
  const drive = d.stops.reduce((s, x) => s + (x.legMin || 0), 0);
  const km = d.stops.reduce((s, x) => s + (x.legKm || 0), 0);
  $('#summary').innerHTML = `
    <span class="chip">${d.stops.length} paradas</span>
    <span class="chip">Visitas: ${fmt(visit)}</span>
    <span class="chip">Deslocamento: ${fmt(drive)}</span>
    <span class="chip">${km.toFixed(1)} km</span>`;
}

function renderStops(t) {
  const d = t.days[dayIdx];
  const warn = warnings(d);
  const others = (i) => t.days.map((x, j) => j !== i ? `<option value="${j}">${esc(x.name)}</option>` : '').join('');
  $('#stops').innerHTML = d.stops.map((s, i) => `
    <li class="stop" data-id="${s.id}" style="--c:${d.color}">
      <div class="sh">
        <span class="num">${i + 1}</span>
        <b>${esc(s.name)}</b>
        <button class="btn sm icon ghost danger" data-act="del" data-id="${s.id}" aria-label="Remover">✕</button>
      </div>
      <div class="fields">
        <label>Horário<input type="time" data-f="time" data-id="${s.id}" value="${s.time || ''}"></label>
        <label>Permanência (min)<input type="number" min="0" data-f="stay" data-id="${s.id}" value="${s.stay ?? 60}"></label>
        ${i > 0 ? `<label>Trajeto
          <select data-f="transport" data-id="${s.id}">
            ${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${k === (s.transport || 'walk') ? 'selected' : ''}>${m.label}</option>`).join('')}
          </select></label>` : ''}
      </div>
      ${i > 0 ? `<div class="leg">${s.legMin != null ? `${Math.round(s.legMin)} min · ${s.legKm.toFixed(1)} km` : 'Trajeto não calculado'}</div>` : ''}
      ${warn.has(i) ? `<div class="warn">O horário não comporta o deslocamento. Você pode salvar mesmo assim.</div>` : ''}
      ${s.desc ? `<details class="info"><summary>Sobre o lugar</summary>
        <p>${esc(s.desc)}</p>
        ${s.photo ? `<img src="${esc(s.photo)}" alt="${esc(s.name)}">` : ''}
        <small>Fonte: ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">Wikipédia</a>` : 'Wikipédia'} (CC BY-SA)</small>
      </details>` : ''}
      <div class="mv">
        <select class="mvSel" data-id="${s.id}"><option value="">Mover para…</option>${others(dayIdx)}</select>
        <button class="btn sm" data-act="idea" data-id="${s.id}">Para ideias</button>
      </div>
    </li>`).join('') || `<p class="empty-line">Nenhuma parada neste dia. Busque um lugar abaixo.</p>`;
}

function renderIdeas(t) {
  $('#ideaCount').textContent = t.ideas.length ? `(${t.ideas.length})` : '';
  $('#ideas').innerHTML = t.ideas.map((p) => `
    <li>
      <span>${esc(p.name)}</span>
      <select>${t.days.map((d, j) => `<option value="${j}" ${j === dayIdx ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      <button class="btn sm" data-act="toDay" data-id="${p.id}">Adicionar</button>
      <button class="btn sm icon ghost danger" data-act="delIdea" data-id="${p.id}" aria-label="Remover">✕</button>
    </li>`).join('') || `<li class="empty-line">Sem ideias guardadas.</li>`;
}

// ---------- mapa ----------
function initMap() {
  map = L.map('map').setView([-14.2, -51.9], 4);
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap',
  });
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics',
  });
  osm.addTo(map);
  L.control.layers({ 'Mapa': osm, 'Satélite': sat }, null, { position: 'topright' }).addTo(map);
  layer = L.layerGroup().addTo(map);
  window.addEventListener('resize', () => map.invalidateSize());
}

function drawMap(t) {
  layer.clearLayers();
  const pts = [];
  const days = overview ? t.days : [t.days[dayIdx]];
  days.filter(Boolean).forEach((d) => {
    d.stops.forEach((s, i) => {
      const ll = [s.lat, s.lon];
      pts.push(ll);
      L.marker(ll, {
        icon: L.divIcon({
          className: '',
          html: `<div class="pin" style="background:${d.color}">${i + 1}</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15],
        }),
      }).bindTooltip(overview ? `${d.name}: ${s.name}` : s.name).addTo(layer);
      if (i > 0) {
        const geo = s.legGeo || [[d.stops[i - 1].lat, d.stops[i - 1].lon], ll];
        const dashed = !s.legGeo;
        L.polyline(geo, { color: '#fff', weight: 8, opacity: .8 }).addTo(layer);
        L.polyline(geo, { color: d.color, weight: 5, dashArray: dashed ? '6 8' : null }).addTo(layer);
      }
    });
  });
  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
}

// ---------- diálogo de viagem ----------
function renderEmojis() {
  $('#emojiGrid').innerHTML = EMOJIS.map((e) =>
    `<button type="button" class="${e === pickedEmoji ? 'on' : ''}" data-e="${e}">${e}</button>`).join('');
}
function openDialog(trip) {
  editingId = trip?.id || null;
  $('#dlgTitle').textContent = trip ? 'Editar viagem' : 'Nova viagem';
  $('#tName').value = trip?.name || '';
  $('#tStart').value = trip?.start || '';
  $('#tEnd').value = trip?.end || '';
  pickedEmoji = trip?.emoji || '🌍';
  renderEmojis();
  $('#tDelete').classList.toggle('hidden', !trip);
  $('#tripDlg').showModal();
}
function saveDialog() {
  const name = $('#tName').value.trim() || 'Minha viagem';
  let start = $('#tStart').value, end = $('#tEnd').value;
  if (start && end && end < start) [start, end] = [end, start];
  if (!start) end = '';

  const inTrip = !$('#trip').classList.contains('hidden');
  let t = editingId ? db.trips.find((x) => x.id === editingId) : null;
  const isNew = !t;
  if (t) {
    Object.assign(t, { name, emoji: pickedEmoji, start, end });
    isoRange(start, end).forEach((iso) => {
      if (!t.days.some((d) => d.date === iso)) t.days.push(newDay(t.days.length, iso));
    });
  } else {
    const days = isoRange(start, end).map((iso, i) => newDay(i, iso));
    t = { id: uid(), name, emoji: pickedEmoji, start, end, days: days.length ? days : [newDay(0)], ideas: [] };
    db.trips.unshift(t);
  }
  save();
  $('#tripDlg').close();
  if (isNew) openTrip(t.id);
  else {
    if (inTrip) renderTrip();
    renderHome();
  }
}
function deleteTrip() {
  if (!editingId || !confirm('Excluir esta viagem e todos os seus dias?')) return;
  db.trips = db.trips.filter((t) => t.id !== editingId);
  if (db.currentId === editingId) db.currentId = null;
  save();
  $('#tripDlg').close();
  goHome();
}

// ---------- importar / exportar ----------
function exportTrip() {
  const t = cur();
  const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${t.name.replace(/[^\w-]+/g, '_')}.json`;
  a.click();
}
async function importTrip(e) {
  try {
    const t = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(t.days) || !t.name) throw new Error('Arquivo inválido.');
    t.id = uid();
    t.ideas = t.ideas || [];
    db.trips.unshift(t);
    openTrip(t.id);
    toast('Viagem importada.');
  } catch (err) { toast(err.message || 'Não foi possível importar.'); }
  e.target.value = '';
}

// ---------- eventos ----------
$('#brandBtn').onclick = goHome;
$('#backBtn').onclick = goHome;
$('#newTripBtn').onclick = () => openDialog(null);
$('#editTripBtn').onclick = () => openDialog(cur());
$('#exportBtn').onclick = exportTrip;
$('#importFile').onchange = importTrip;

$('#tripCards').onclick = (e) => {
  const ed = e.target.closest('[data-edit]');
  if (ed) { e.stopPropagation(); return openDialog(db.trips.find((t) => t.id === ed.dataset.edit)); }
  const card = e.target.closest('.trip-card');
  if (card) openTrip(card.dataset.id);
};

$('#emojiGrid').onclick = (e) => {
  const b = e.target.closest('[data-e]'); if (!b) return;
  pickedEmoji = b.dataset.e; renderEmojis();
};
$('#tCancel').onclick = () => $('#tripDlg').close();
$('#tSave').onclick = saveDialog;
$('#tDelete').onclick = deleteTrip;

$('#daysNav').onclick = (e) => {
  const t = cur();
  const overviewButton = e.target.closest('[data-act="overview"]');
  if (overviewButton) { overview = true; renderTrip(); return; }
  const add = e.target.closest('[data-act="addDay"]');
  if (add) {
    const n = prompt('Nome do dia:', `Dia ${t.days.length + 1}`);
    if (!n) return;
    const d = newDay(t.days.length);
    d.name = n;
    t.days.push(d); dayIdx = t.days.length - 1; overview = false; save(); renderTrip();
    return;
  }
  const tab = e.target.closest('.tab');
  if (tab) { dayIdx = +tab.dataset.i; overview = false; renderTrip(); }
};

$('#overviewDays').onclick = (e) => {
  const button = e.target.closest('[data-day]');
  if (!button) return;
  dayIdx = +button.dataset.day;
  overview = false;
  renderTrip();
};

$('#dayHead').onclick = (e) => {
  const t = cur(), d = t.days[dayIdx];
  const sw = e.target.closest('[data-color]');
  if (sw) { d.color = sw.dataset.color; save(); return renderTrip(); }
  if (e.target.closest('[data-act="delDay"]')) {
    if (t.days.length === 1) return toast('A viagem precisa ter ao menos um dia.');
    if (!confirm('Excluir este dia e suas paradas?')) return;
    t.days.splice(dayIdx, 1); dayIdx = 0; save(); renderTrip();
  }
};
$('#dayHead').onchange = (e) => {
  if (e.target.id !== 'dayName') return;
  cur().days[dayIdx].name = e.target.value.trim() || 'Dia';
  save(); renderTrip();
};

$('#recalcDay').onclick = () => withBusy(() => routeDay(cur().days[dayIdx]));
$('#recalcTrip').onclick = () => withBusy(async () => { for (const d of cur().days) await routeDay(d); });

$('#stops').addEventListener('change', (e) => {
  const el = e.target, t = cur(), d = t.days[dayIdx];
  if (el.classList.contains('mvSel')) {
    if (!el.value) return;
    const idx = d.stops.findIndex((s) => s.id === el.dataset.id);
    const target = t.days[+el.value];
    const [moved] = d.stops.splice(idx, 1);
    if (d.stops[idx]) clearLeg(d.stops[idx]);
    fixLegs(d);
    clearLeg(moved);
    target.stops.push(moved);
    fixLegs(target);
    return reroute(d, target);
  }
  const f = el.dataset.f; if (!f) return;
  const i = d.stops.findIndex((s) => s.id === el.dataset.id);
  if (i < 0) return;
  d.stops[i][f] = f === 'stay' ? (+el.value || 0) : el.value;
  if (f === 'transport' && i > 0) return withBusy(() => legFor(d, i));
  save(); renderTrip();
});

$('#stops').onclick = (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = cur().days[dayIdx];
  const idx = d.stops.findIndex((s) => s.id === b.dataset.id);
  if (idx < 0) return;
  if (b.dataset.act === 'del') {
    const [removed] = d.stops.splice(idx, 1);
    fixLegs(d);
    if (d.stops.length && idx < d.stops.length) return reroute(d);
    save(); renderTrip();
  }
  if (b.dataset.act === 'idea') {
    const t = cur();
    const [s] = d.stops.splice(idx, 1);
    fixLegs(d);
    t.ideas.push({ id: s.id, name: s.name, lat: s.lat, lon: s.lon });
    return reroute(d);
  }
};

Sortable.create($('#stops'), {
  animation: 150,
  handle: '.sh',
  onEnd() {
    const d = cur().days[dayIdx];
    const ids = [...$('#stops').children].map((li) => li.dataset.id);
    d.stops = ids.map((id) => d.stops.find((s) => s.id === id)).filter(Boolean);
    fixLegs(d);
    reroute(d);
  },
});

$('#searchForm').onsubmit = async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim(); if (!q) return;
  try {
    lastResults = await searchPlaces(q);
    $('#results').innerHTML = lastResults.map((p, i) => `
      <li>
        <span><b>${esc(p.name)}</b><br><small>${esc(p.address)}</small></span>
        <button class="btn sm primary" data-act="addDay" data-i="${i}">+ Dia</button>
        <button class="btn sm" data-act="addIdea" data-i="${i}">Ideias</button>
      </li>`).join('') || '<li class="empty-line">Nada encontrado.</li>';
  } catch (err) { toast(err.message); }
};

$('#results').onclick = async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const place = lastResults[+b.dataset.i]; if (!place) return;
  const t = cur();
  // limpa a busca após escolher
  lastResults = [];
  $('#results').innerHTML = '';
  $('#q').value = '';

  if (b.dataset.act === 'addIdea') {
    t.ideas.push({ id: uid(), name: place.name, lat: place.lat, lon: place.lon });
    save(); renderTrip(); toast('Guardado nas ideias.');
    return;
  }
  const d = t.days[dayIdx];
  const stop = { id: uid(), name: place.name, lat: place.lat, lon: place.lon, time: '', stay: 60, transport: 'walk', desc: '', photo: '', url: '' };
  d.stops.push(stop);
  fixLegs(d);
  save(); renderTrip();
  await enrich(stop);
  save(); renderTrip();
  if (d.stops.length > 1 && hasKey()) withBusy(() => legFor(d, d.stops.length - 1));
};

$('#ideas').onclick = (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const t = cur();
  const idx = t.ideas.findIndex((p) => p.id === b.dataset.id);
  if (idx < 0) return;
  if (b.dataset.act === 'delIdea') { t.ideas.splice(idx, 1); save(); return renderTrip(); }
  if (b.dataset.act === 'toDay') {
    const p = t.ideas[idx];
    const d = t.days[+b.closest('li').querySelector('select').value];
    t.ideas.splice(idx, 1);
    const stop = { id: uid(), name: p.name, lat: p.lat, lon: p.lon, time: '', stay: 60, transport: 'walk', desc: '', photo: '', url: '' };
    d.stops.push(stop);
    fixLegs(d);
    save(); renderTrip();
    enrich(stop).then(() => { save(); renderTrip(); });
    if (d.stops.length > 1 && hasKey()) withBusy(() => legFor(d, d.stops.length - 1));
  }
};

// ---------- inicialização ----------
$('#brandName').textContent = CONFIG.APP_NAME || 'Roteiros';
initMap();
show(db.currentId && cur() ? 'trip' : 'home');
if (cur()) renderTrip(); else renderHome();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

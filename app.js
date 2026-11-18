const KEY = 'mundo-afora.v1';
const $ = (s) => document.querySelector(s);

const EMOJIS = ['🌍','✈️','🏖️','🏔️','🏙️','🗺️','🚗','🚆','⛵','🏕️','🍷','🎒','📸','🌅','🌴','🏛️','🎡','🌋','🐋','🛶','🍜','🌸','❄️','🌵','🎉','💼','⚽','🎨'];
const FLAGS = [
  ['br','Brasil'],['pt','Portugal'],['es','Espanha'],['fr','França'],['it','Itália'],['de','Alemanha'],
  ['gb','Reino Unido'],['ie','Irlanda'],['nl','Países Baixos'],['ch','Suíça'],['at','Áustria'],['gr','Grécia'],
  ['no','Noruega'],['se','Suécia'],['is','Islândia'],['tr','Turquia'],['ru','Rússia'],['us','Estados Unidos'],
  ['ca','Canadá'],['mx','México'],['ar','Argentina'],['cl','Chile'],['uy','Uruguai'],['pe','Peru'],['co','Colômbia'],
  ['jp','Japão'],['kr','Coreia do Sul'],['cn','China'],['in','Índia'],['th','Tailândia'],['ae','Emirados Árabes'],
  ['ma','Marrocos'],['eg','Egito'],['za','África do Sul'],['au','Austrália'],['nz','Nova Zelândia'],
];
const COLORS = ['#2f5d8a','#4a6fa5','#1f5f6b','#3d7a4f','#6b8e4e','#8b5e3c','#a0522d','#9a6b1f','#5c4033','#1a1a1a'];
const MODES = {
  walk: { profile: 'foot-walking', label: 'A pé' },
  bike: { profile: 'cycling-regular', label: 'Bicicleta' },
  car:  { profile: 'driving-car', label: 'Carro' },
};

const ICON_EMOJIS = ['📍','🏛️','⛪','🕌','🏰','🗿','⛲','🌉','🚉','🎭','🖼️','🍕','🍝','☕','🍦','🛍️','🌳','🌊','🏟️','🌃','🏞️','🎡','🍷','🎶','🛕','🌅','🏖️','🚠','🕰️'];
let iconEdit = null;
let db = JSON.parse(localStorage.getItem(KEY) || 'null') || { trips: [], currentId: null };
let dayIdx = 0, overview = true, lastResults = [], editingId = null;
let picked = '🌍', pickerTab = 'emoji';
let map, layer;
const wikiBusy = new Set();

// ---------- utilidades ----------
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const uid = () => Math.random().toString(36).slice(2, 10);
const cur = () => db.trips.find((t) => t.id === db.currentId);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fmt = (min) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`;
const hasKey = () => CONFIG.ORS_KEY && !CONFIG.ORS_KEY.startsWith('COLE_');
const flagUrl = (code, w = 80) => `https://flagcdn.com/w${w}/${code}.png`;

// valor do ícone: emoji ("🌍") ou bandeira ("flag:br")
function visual(v, cls = 'emo') {
  if (v && v.startsWith('flag:')) return `<img class="flag ${cls}" src="${flagUrl(v.slice(5))}" alt="" loading="lazy">`;
  return `<span class="${cls}">${esc(v || '🌍')}</span>`;
}
function toast(msg, kind = '') {
  const t = $('#toast');
  t.className = kind;
  t.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 3200);
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
function newStop(place) {
  return { id: uid(), name: place.name, lat: place.lat, lon: place.lon, time: '', stay: 60,
    transport: 'walk', desc: '', photo: '', originalPhoto: '', url: '', icon: '', wikiDone: false };
}
function sortedTrips() {
  return [...db.trips].sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999'));
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
// nomes de arquivo que costumam indicar mapa, brasão, logo ou ícone (não é garantia)
const NOT_PHOTO_RE = /\bmap|mapa|carte|karte|locator|localiz|roteiro|route|itiner|logo|escudo|brasao|coat|flag|bandeira|symbol|icon|diagram|svg/i;
function isPhotoUrl(url) { return !!url && !NOT_PHOTO_RE.test(url) && !/\.(svg|gif)(\?|$)/i.test(url); }

async function wikiInfo(name) {
  const out = { desc: '', photo: '', url: '' };
  try {
    const r = await fetch('https://pt.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(name));
    if (r.ok) {
      const j = await r.json();
      out.desc = (j.extract || '').slice(0, 400);
      out.url = j.content_urls?.desktop?.page || '';
      if (isPhotoUrl(j.thumbnail?.source)) out.photo = j.thumbnail.source;
    }
  } catch { /* sem rede ou sem página */ }
  if (!out.photo) out.photo = await wikiPhotoFromImages(name);
  return out;
}
async function wikiPhotoFromImages(name) {
  try {
    const api = 'https://pt.wikipedia.org/w/api.php?action=query&generator=images&gimlimit=30' +
      '&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=640&redirects=1&format=json&origin=*&titles=' + encodeURIComponent(name);
    const j = await (await fetch(api)).json();
    const pages = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index);
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime) || ii.width < 400) continue;
      if (!isPhotoUrl(p.title + ' ' + (ii.thumburl || ''))) continue;
      return ii.thumburl;
    }
  } catch { /* sem rede */ }
  return '';
}
async function enrich(stop) {
  if (wikiBusy.has(stop.id)) return;
  wikiBusy.add(stop.id);
  const w = await wikiInfo(stop.name);
  if (w) {
    stop.desc = w.desc;
    stop.url = w.url;
    if (!stop.icon) stop.photo = w.photo;
  }
  stop.wikiDone = true;
  wikiBusy.delete(stop.id);
}
// busca fotos e descrições das paradas que ainda não foram consultadas (ex.: viagens antigas)
function ensureWiki(t) {
  const pending = t.days.flatMap((d) => d.stops).filter((s) => !s.wikiDone && !wikiBusy.has(s.id));
  if (!pending.length) return;
  Promise.all(pending.map(enrich)).then(() => { save(); renderTrip(); });
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

async function withBusy(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg, 'ok'); }
  catch (e) { toast(e.message || 'Erro ao calcular trajeto.'); }
  save(); renderTrip();
}
// recalcula quando há mudança de ordem/remoção; sem chave, só marca como pendente
function reroute(...days) {
  if (!hasKey()) { save(); renderTrip(); return; }
  return withBusy(async () => { for (const d of days) await routeDay(d); }, 'Trajetos recalculados.');
}
function warnings(d) {
  const set = new Set();
  for (let i = 1; i < d.stops.length; i++) {
    const a = d.stops[i - 1], b = d.stops[i];
    if (a.time && b.time && b.legMin != null && toMin(a.time) + (+a.stay || 0) + b.legMin > toMin(b.time)) set.add(i);
  }
  return set;
}
function totals(days) {
  return days.reduce((acc, d) => {
    acc.stops += d.stops.length;
    d.stops.forEach((s, i) => {
      acc.visit += +s.stay || 0;
      if (i === 0) return;
      if (s.legMin == null || s.legKm == null) acc.pending++;
      else {
        acc.drive += s.legMin;
        acc.km += s.legKm;
      }
    });
    return acc;
  }, { stops: 0, visit: 0, drive: 0, km: 0, pending: 0 });
}
function routeTimeLabel(tot) { return tot.pending ? 'A calcular' : fmt(tot.drive); }
function routeDistanceLabel(tot) { return tot.pending ? 'A calcular' : `${tot.km.toFixed(1)} km`; }

// ---------- telas ----------
function show(view) {
  document.body.classList.toggle('in-trip', view === 'trip');
  $('#home').classList.toggle('hidden', view !== 'home');
  $('#trip').classList.toggle('hidden', view !== 'trip');
  $('#backBtn').classList.toggle('hidden', view === 'home');
  $('#editTripBtn').classList.toggle('hidden', view !== 'trip');
  $('#exportBtn').classList.toggle('hidden', view !== 'trip');
  if (view === 'home') $('#topTitle').innerHTML = '';
  window.scrollTo(0, 0);
}
function goHome() { show('home'); renderHome(); }
function openTrip(id) {
  db.currentId = id; dayIdx = 0; overview = true; save();
  show('trip');
  map.invalidateSize();
  renderTrip();
}

function renderHome() {
  const trips = sortedTrips();
  const stops = db.trips.reduce((s, t) => s + t.days.reduce((x, d) => x + d.stops.length, 0), 0);
  $('#heroStats').textContent = db.trips.length
    ? `${db.trips.length} ${db.trips.length === 1 ? 'viagem' : 'viagens'} · ${stops} ${stops === 1 ? 'parada' : 'paradas'} planejadas`
    : '';
  $('#tripCards').innerHTML = trips.map((t) => {
    const n = t.days.reduce((s, d) => s + d.stops.length, 0);
    const c1 = t.days[0]?.color || COLORS[0];
    const c2 = t.days[t.days.length - 1]?.color || COLORS[3];
    return `
    <article class="card trip-card" data-id="${t.id}" tabindex="0" role="group" aria-roledescription="cartão de viagem; pressione Enter para abrir" aria-label="${esc(t.name)}" style="--c:${c1};--c2:${c2}">
      <div class="trip-cover"><div class="trip-icon">${visual(t.emoji || '🌍', 'ico')}</div><span class="cover-label">SEU ROTEIRO</span></div>
      <button type="button" class="btn edit" data-edit="${t.id}" aria-label="Editar viagem ${esc(t.name)}">✎ <span>Editar</span></button>
      <div class="trip-body">
        <h3>${esc(t.name)}</h3>
        <p class="dates">${dateRange(t)}</p>
        <div class="meta"><span class="chip">▦ ${t.days.length} ${t.days.length === 1 ? 'dia' : 'dias'}</span><span class="chip">⌖ ${n} ${n === 1 ? 'parada' : 'paradas'}</span></div>
        <div class="trip-card-footer"><span>${n ? 'Roteiro em andamento' : 'Pronto para planejar'}</span><b>Abrir roteiro <span aria-hidden="true">→</span></b></div>
      </div>
    </article>`;
  }).join('') || `
    <div class="empty">
      <div class="big-emoji">🧭</div>
      <p><b>Nenhuma viagem ainda.</b></p>
      <p>Crie a primeira e comece a montar o seu roteiro.</p>
      <button class="btn primary" data-new>+ Nova viagem</button>
    </div>`;
}

function renderTrip() {
  const t = cur();
  if (!t) return goHome();
  if (dayIdx >= t.days.length) dayIdx = 0;
  $('#topTitle').innerHTML = `${visual(t.emoji || '🌍', 'emo')}<span>${esc(t.name)}</span>`;
  renderDaysNav(t);
  $('#dayActions').classList.toggle('hidden', overview);
  $('#searchForm').classList.toggle('hidden', overview);
  $('.search-section').classList.toggle('hidden', overview);
  $('#recalcDay').disabled = !hasKey();
  $('#recalcTrip').disabled = !hasKey();
  $('#routeHelp').textContent = hasKey()
    ? 'Atualize as estimativas entre as paradas.'
    : 'Configure a chave do OpenRouteService em config.js para calcular trajetos.';
  $('#results').classList.toggle('hidden', overview);
  $('.ideas').classList.toggle('hidden', overview);
  $('#stops').classList.toggle('hidden', overview);
  $('#summary').classList.toggle('hidden', overview);
  $('#overviewDays').classList.toggle('hidden', !overview);
  if (overview) {
    renderOverview(t);
  } else {
    renderDayHead(t);
    renderSummary(t);
    renderStops(t);
    renderIdeas(t);
  }
  drawMap(t);
  ensureWiki(t);
}

function renderDaysNav(t) {
  $('#daysNav').innerHTML = `
    <button class="tab overview-tab ${overview ? 'on' : ''}" data-act="overview" aria-pressed="${overview}">
      <b>Visão geral</b><small>Toda a viagem</small>
    </button>` + t.days.map((d, i) => `
    <button class="tab ${!overview && i === dayIdx ? 'on' : ''}" data-i="${i}" style="--c:${d.color}" aria-pressed="${!overview && i === dayIdx}">
      <b>${esc(d.name)}</b><small>${d.date ? fmtDate(d.date) : 'sem data'} · ${d.stops.length} ${d.stops.length === 1 ? 'parada' : 'paradas'}</small>
    </button>`).join('') + `<button type="button" class="tab add" data-act="addDay"><b>＋ Novo dia</b><small>Adicionar ao roteiro</small></button>`;
}

function renderOverview(t) {
  const tot = totals(t.days);
  $('#dayHead').innerHTML = `
    <div class="dh">
      <h2>Visão geral</h2>
    </div>
    <p class="dates" style="margin-top:4px">${dateRange(t)}</p>`;
  $('#overviewDays').innerHTML = `
    <div class="overview-stats">
      <div class="stat"><b>${t.days.length}</b><span>dias</span></div>
      <div class="stat"><b>${tot.stops}</b><span>paradas</span></div>
      <div class="stat"><b>${tot.pending ? 'A calcular' : tot.km.toFixed(1)}</b><span>km de trajeto</span></div>
      <div class="stat"><b>${fmt(tot.visit)}</b><span>visitas</span></div>
      </div>
    <div class="overview-grid">
      ${t.days.map((d, i) => {
        const dt = totals([d]);
        return `
        <article class="overview-day" style="--c:${d.color}" data-day="${i}" role="button" tabindex="0" aria-label="Abrir ${esc(d.name)}">
          <header class="overview-day-head">
            <h3>${esc(d.name)}</h3>
            <small>${d.date ? fmtDate(d.date) : 'sem data'}</small>
          </header>
          <div class="overview-day-body">
            <div class="summary">
              <span class="chip">${d.stops.length} ${d.stops.length === 1 ? 'parada' : 'paradas'}</span>
              <span class="chip">${routeDistanceLabel(dt)}</span>
            </div>
            ${d.stops.length
              ? `<ol>${d.stops.map((s, j) => `
                  <li>
            ${s.icon ? `<span class="thumb">${esc(s.icon)}</span>` : (s.photo ? `<img class="thumb" src="${esc(s.photo)}" alt="" loading="lazy">` : `<span class="thumb">📍</span>`)}
                    <span class="name">${j + 1}. ${esc(s.name)}</span>
                    ${s.time ? `<span class="t">${esc(s.time)}</span>` : ''}
                  </li>`).join('')}</ol>`
              : '<p class="empty-line">Nenhuma parada neste dia.</p>'}
            <button class="btn sm" data-day="${i}">Abrir dia →</button>
          </div>
        </article>`;
      }).join('')}
      <button type="button" class="card overview-add" data-act="addDay">＋ Adicionar dia</button>
    </div>`;
}

function renderDayHead(t) {
  const d = t.days[dayIdx];
  $('#dayHead').innerHTML = `
    <div class="dh">
      <input id="dayName" value="${esc(d.name)}" aria-label="Nome do dia">
      <button class="btn sm ghost danger" data-act="delDay">Excluir dia</button>
    </div>
    <div class="swatches" style="margin-top:10px">
      ${COLORS.map((c) => `<button class="sw ${c === d.color ? 'on' : ''}" style="background:${c}" data-color="${c}" aria-label="Cor do dia"></button>`).join('')}
    </div>`;
}

function renderSummary(t) {
  const d = t.days[dayIdx];
  const tot = totals([d]);
  $('#summary').innerHTML = `
    <span class="chip">${d.stops.length} ${d.stops.length === 1 ? 'parada' : 'paradas'}</span>
    <span class="chip">No local: ${fmt(tot.visit)}</span>
    <span class="chip">Deslocamento: ${routeTimeLabel(tot)}</span>
    <span class="chip">${routeDistanceLabel(tot)}</span>`;
}

function renderStops(t) {
  const d = t.days[dayIdx];
  const warn = warnings(d);
  const others = (i) => t.days.map((x, j) => j !== i ? `<option value="${j}">${esc(x.name)}</option>` : '').join('');
  $('#stops').innerHTML = d.stops.map((s, i) => `
    <li class="stop" data-id="${s.id}" style="--c:${d.color}">
      ${s.photo
        ? `<div class="stop-photo-wrap">
            <img class="stop-photo" src="${esc(s.photo)}" alt="${esc(s.name)}" loading="lazy">
            <button type="button" class="stop-photo-action" data-act="icon" data-id="${s.id}" aria-label="Trocar imagem por emoji">
              ${iconEdit === s.id ? 'Escolha um emoji abaixo' : 'Usar emoji'}
            </button>
          </div>`
        : `<div class="stop-photo-emoji-wrap">
            <button type="button" class="stop-photo ph" data-act="icon" data-id="${s.id}" aria-label="Escolher emoji">${esc(s.icon || '📍')}<small>${iconEdit === s.id ? 'escolha abaixo' : 'trocar emoji'}</small></button>
            ${s.originalPhoto ? `<button type="button" class="stop-photo-action" data-act="restorePhoto" data-id="${s.id}" aria-label="Voltar à imagem">Voltar à imagem</button>` : ''}
          </div>`}
      ${iconEdit === s.id ? `<div class="icon-grid">${ICON_EMOJIS.map((e) => `<button type="button" data-act="pickIcon" data-id="${s.id}" data-v="${e}" class="${(s.icon || '📍') === e ? 'on' : ''}" aria-label="${e}">${e}</button>`).join('')}</div>` : ''}
      <div class="stop-body">
        <div class="sh">
          <span class="num">${i + 1}</span>
          <b>${esc(s.name)}</b>
          <button class="btn sm icon ghost danger" data-act="del" data-id="${s.id}" aria-label="Remover parada">✕</button>
        </div>
        <div class="stop-chips">
          ${s.time ? `<span class="chip time">🕒 ${esc(s.time)}</span>` : ''}
          ${i > 0 ? `<span class="chip leg">${s.legMin != null ? `${MODES[s.transport || 'walk'].label}: ${Math.round(s.legMin)} min · ${s.legKm.toFixed(1)} km` : 'Trajeto não calculado'}</span>` : ''}
        </div>
        <div class="fields">
          <label>Chegada às<input type="time" data-f="time" data-id="${s.id}" value="${s.time || ''}" aria-label="Horário de chegada"></label>
          <label>Tempo no local (min)<input type="number" min="0" step="5" data-f="stay" data-id="${s.id}" value="${s.stay ?? 60}" aria-label="Tempo de permanência em minutos"></label>
          ${i > 0 ? `<label>Como chegar
            <select data-f="transport" data-id="${s.id}" aria-label="Meio de transporte">
              ${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${k === (s.transport || 'walk') ? 'selected' : ''}>${m.label}</option>`).join('')}
            </select></label>` : ''}
        </div>
        ${warn.has(i) ? `<div class="warn">⚠️ O horário não comporta o deslocamento. Você pode salvar mesmo assim.</div>` : ''}
        ${s.desc ? `<details class="info"><summary>Sobre o lugar</summary>
          <p>${esc(s.desc)}</p>
          <small>Fonte: ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">Wikipédia</a>` : 'Wikipédia'} (CC BY-SA)</small>
        </details>` : ''}
        <div class="mv">
          <select class="mvSel" data-id="${s.id}" aria-label="Mover ${esc(s.name)} para outro dia"><option value="">Mover para outro dia…</option>${others(dayIdx)}</select>
          <button type="button" class="btn sm" data-act="idea" data-id="${s.id}">Mover para ideias</button>
        </div>
      </div>
    </li>`).join('') || `
    <div class="empty" style="padding:28px 16px">
      <div class="big-emoji">📍</div>
      <p>Nenhuma parada neste dia.</p>
      <p class="muted">Busque um lugar abaixo para adicioná-lo.</p>
    </div>`;
}

function renderIdeas(t) {
  $('#ideaCount').textContent = t.ideas.length ? `(${t.ideas.length})` : '';
  $('#ideas').innerHTML = t.ideas.map((p) => `
    <li>
      <span>${esc(p.name)}</span>
      <select aria-label="Escolha em qual dia adicionar ${esc(p.name)}">${t.days.map((d, j) => `<option value="${j}" ${j === dayIdx ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      <button type="button" class="btn sm" data-act="toDay" data-id="${p.id}">Adicionar ao dia</button>
      <button class="btn sm icon ghost danger" data-act="delIdea" data-id="${p.id}" aria-label="Remover ideia">✕</button>
    </li>`).join('') || `<li class="empty-line">Sua lista está vazia. Use “Mover para ideias” em uma parada ou “Guardar ideia” nos resultados da busca.</li>`;
}

// ---------- mapa ----------
const MAP_STYLES = {
  osm:     { label: 'Padrão', make: () => tile('https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© OpenStreetMap') },
  sat:     { label: 'Satélite', make: () => satImagery() },
  satlab:  { label: 'Satélite com nomes', make: () => L.layerGroup([satImagery(), L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '' })]) },
};
function tile(url, attribution, subdomains = 'abc') {
  return L.tileLayer(url, { maxZoom: 20, subdomains, attribution });
}
function satImagery() {
  return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics',
  });
}
function initMap() {
  map = L.map('map', { zoomControl: true }).setView([-14.2, -51.9], 4);
  const saved = localStorage.getItem('mundo-afora.map');
  const current = MAP_STYLES[saved] ? saved : 'osm';
  const byId = {};
  for (const [id, o] of Object.entries(MAP_STYLES)) {
    byId[id] = o.make();
  }
  byId[current].addTo(map);

  const MapStyleControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const container = L.DomUtil.create('div', 'map-style-control');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      container.innerHTML = `
        <button type="button" class="map-style-toggle" aria-expanded="false" aria-label="Escolher estilo do mapa">
          <span class="map-style-icon">◫</span>
          <span class="map-style-label">Mapa</span>
          <span class="map-style-chevron">⌄</span>
        </button>
        <div class="map-style-menu" role="radiogroup" aria-label="Estilo do mapa">
          ${Object.entries(MAP_STYLES).map(([id, style]) => `
            <button type="button" class="map-style-option" data-style="${id}" role="radio" aria-checked="false">
              <span class="map-preview ${id}"><span></span></span>
              <span>${esc(style.label)}</span>
            </button>
          `).join('')}
        </div>
      `;

      const toggle = container.querySelector('.map-style-toggle');
      const menu = container.querySelector('.map-style-menu');
      const label = container.querySelector('.map-style-label');

      const update = (id) => {
        container.querySelectorAll('.map-style-option').forEach((button) => {
          const active = button.dataset.style === id;
          button.classList.toggle('active', active);
          button.setAttribute('aria-checked', String(active));
        });
        label.textContent = MAP_STYLES[id].label;
      };

      toggle.addEventListener('click', () => {
        const open = container.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });

      container.querySelectorAll('.map-style-option').forEach((button) => {
        button.addEventListener('click', () => {
          const id = button.dataset.style;
          Object.values(byId).forEach((layerItem) => map.removeLayer(layerItem));
          byId[id].addTo(map);
          localStorage.setItem('mundo-afora.map', id);
          update(id);
          container.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });

      update(current);
      return container;
    },
  });
  new MapStyleControl().addTo(map);

  layer = L.layerGroup().addTo(map);
  window.addEventListener('resize', () => map.invalidateSize());
}

function tipHtml(s, day) {
  const when = day ? `${esc(day.name)}${s.time ? ' · ' + esc(s.time) : ''}` : (s.time ? esc(s.time) : '');
  return `<div class="tip">
    ${s.icon ? `<div class="tip-icon">${esc(s.icon)}</div>` : (s.photo ? `<img src="${esc(s.photo)}" alt="">` : `<div class="tip-icon">📍</div>`)}
    <div class="tip-body"><b>${esc(s.name)}</b>${when ? `<span>${when}</span>` : ''}</div>
  </div>`;
}

function drawMap(t) {
  layer.clearLayers();
  const pts = [];
  const days = overview ? t.days : [t.days[dayIdx]];
  days.filter(Boolean).forEach((d, di) => {
    const dayRealIndex = overview ? t.days.indexOf(d) : dayIdx;
    d.stops.forEach((s, i) => {
      const ll = [s.lat, s.lon];
      pts.push(ll);
      L.marker(ll, {
        icon: L.divIcon({
          className: '',
          html: `<div class="pin" style="background:${d.color}">${i + 1}</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16],
        }),
      })
        .bindTooltip(tipHtml(s, overview ? d : null), { className: 'map-tip', direction: 'top', offset: [0, -18], opacity: 1 })
        .on('click', () => focusStop(dayRealIndex, s.id))
        .addTo(layer);
      if (i > 0) {
        const geo = s.legGeo || [[d.stops[i - 1].lat, d.stops[i - 1].lon], ll];
        const dashed = !s.legGeo;
        L.polyline(geo, { color: '#fff', weight: 8, opacity: .8, interactive: false }).addTo(layer);
        L.polyline(geo, { color: d.color, weight: 5, dashArray: dashed ? '6 8' : null, interactive: false }).addTo(layer);
      }
    });
  });
  if (pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: 15 });
}

// clicar num ponto do mapa leva ao cartão da parada
function focusStop(dayI, stopId) {
  if (dayI !== dayIdx || overview) { dayIdx = dayI; overview = false; renderTrip(); }
  requestAnimationFrame(() => {
    document.querySelectorAll('.stop.hl').forEach((el) => el.classList.remove('hl'));
    const el = document.querySelector(`.stop[data-id="${stopId}"]`);
    if (el) {
      el.classList.add('hl');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

// ---------- diálogo de viagem ----------
function renderPicker() {
  document.querySelectorAll('[data-pt]').forEach((b) => b.classList.toggle('on', b.dataset.pt === pickerTab));
  $('#flagFilter').classList.toggle('hidden', pickerTab !== 'flag');
  $('#pickPreview').innerHTML = visual(picked, 'ico');
  const grid = $('#emojiGrid');
  if (pickerTab === 'emoji') {
    grid.className = 'picker-grid emo';
    grid.innerHTML = EMOJIS.map((e) =>
      `<button type="button" class="${e === picked ? 'on' : ''}" data-e="${e}" aria-label="${e}">${e}</button>`).join('');
  } else {
    const q = $('#flagFilter').value.trim().toLowerCase();
    const list = FLAGS.filter(([, n]) => !q || n.toLowerCase().includes(q));
    grid.className = 'picker-grid';
    grid.innerHTML = list.map(([code, name]) => {
      const v = 'flag:' + code;
      return `<button type="button" class="${v === picked ? 'on' : ''}" data-e="${v}" title="${esc(name)}" aria-label="${esc(name)}">
        <img class="flag" src="${flagUrl(code, 80)}" alt="">
      </button>`;
    }).join('') || '<p class="empty-line" style="grid-column:1/-1">Nenhum país encontrado.</p>';
  }
}
function updateDlgInfo() {
  const start = $('#tStart').value;
  const end = $('#tEnd').value;
  const error = $('#dlgError');
  $('#tEnd').min = start || '';
  error.classList.add('hidden');
  if (end && !start) {
    $('#dlgInfo').textContent = 'Informe a data de início para definir a data final.';
    error.textContent = 'A data final precisa de uma data de início.';
    error.classList.remove('hidden');
    return;
  }
  if (start && end && end < start) {
    $('#dlgInfo').textContent = 'Corrija o período para continuar.';
    error.textContent = 'A data final não pode ser anterior à data de início.';
    error.classList.remove('hidden');
    return;
  }
  const n = start ? isoRange(start, end || start).length : 0;
  $('#dlgInfo').textContent = n
    ? `${n} ${n === 1 ? 'dia será criado' : 'dias serão criados'} automaticamente.`
    : 'Sem datas: a viagem começa com um dia.';
}
function openDialog(trip) {
  editingId = trip?.id || null;
  $('#dlgTitle').textContent = trip ? 'Editar viagem' : 'Nova viagem';
  $('#tName').value = trip?.name || '';
  $('#tStart').value = trip?.start || '';
  $('#tEnd').value = trip?.end || '';
  picked = trip?.emoji || '🌍';
  pickerTab = picked.startsWith('flag:') ? 'flag' : 'emoji';
  $('#flagFilter').value = '';
  renderPicker();
  updateDlgInfo();
  $('#tDelete').classList.toggle('hidden', !trip);
  $('#tripDlg').showModal();
  setTimeout(() => $('#tName').focus(), 50);
}
function saveDialog() {
  const name = $('#tName').value.trim() || 'Minha viagem';
  let start = $('#tStart').value, end = $('#tEnd').value;
  if (end && !start) {
    $('#dlgError').textContent = 'Informe a data de início antes de definir a data final.';
    $('#dlgError').classList.remove('hidden');
    $('#tStart').focus();
    return;
  }
  if (start && end && end < start) {
    $('#dlgError').textContent = 'A data final não pode ser anterior à data de início.';
    $('#dlgError').classList.remove('hidden');
    $('#tEnd').focus();
    return;
  }
  if (!start) end = '';

  const inTrip = !$('#trip').classList.contains('hidden');
  let t = editingId ? db.trips.find((x) => x.id === editingId) : null;
  const isNew = !t;
  if (t) {
    Object.assign(t, { name, emoji: picked, start, end });
    isoRange(start, end).forEach((iso) => {
      if (!t.days.some((d) => d.date === iso)) t.days.push(newDay(t.days.length, iso));
    });
  } else {
    const days = isoRange(start, end).map((iso, i) => newDay(i, iso));
    t = { id: uid(), name, emoji: picked, start, end, days: days.length ? days : [newDay(0)], ideas: [] };
    db.trips.push(t);
  }
  save();
  $('#tripDlg').close();
  if (isNew) { toast('Viagem criada! Agora adicione os lugares.', 'ok'); openTrip(t.id); }
  else {
    toast('Viagem atualizada.', 'ok');
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
  toast('Viagem excluída.');
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
  toast('Arquivo exportado.', 'ok');
}
async function importTrip(e) {
  try {
    const file = e.target.files?.[0];
    if (!file) return;
    const t = JSON.parse(await file.text());
    if (!Array.isArray(t.days) || !t.name) throw new Error('Arquivo inválido.');
    t.id = uid();
    t.ideas = t.ideas || [];
    db.trips.push(t);
    openTrip(t.id);
    toast('Viagem importada.', 'ok');
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
  if (e.target.closest('[data-new]')) return openDialog(null);
  const ed = e.target.closest('[data-edit]');
  if (ed) { e.stopPropagation(); return openDialog(db.trips.find((t) => t.id === ed.dataset.edit)); }
  const card = e.target.closest('.trip-card');
  if (card) openTrip(card.dataset.id);
};
$('#tripCards').onkeydown = (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('trip-card')) {
    e.preventDefault();
    openTrip(e.target.dataset.id);
  }
};

document.querySelectorAll('[data-pt]').forEach((b) => b.onclick = () => { pickerTab = b.dataset.pt; renderPicker(); });
$('#flagFilter').oninput = renderPicker;
$('#emojiGrid').onclick = (e) => {
  const b = e.target.closest('[data-e]'); if (!b) return;
  picked = b.dataset.e; renderPicker();
};
$('#tName').onkeydown = (e) => { if (e.key === 'Enter') saveDialog(); };
$('#tStart').oninput = updateDlgInfo;
$('#tEnd').oninput = updateDlgInfo;
$('#tCancel').onclick = () => $('#tripDlg').close();
$('#tSave').onclick = saveDialog;
$('#tDelete').onclick = deleteTrip;

$('#daysNav').onclick = (e) => {
  const t = cur();
  if (e.target.closest('[data-act="overview"]')) { overview = true; return renderTrip(); }
  if (e.target.closest('[data-act="addDay"]')) {
    const d = newDay(t.days.length);
    t.days.push(d);
    dayIdx = t.days.length - 1;
    overview = false;
    save();
    renderTrip();
    toast('Novo dia adicionado. Edite o nome no topo do dia.', 'ok');
    return;
  }
  const tab = e.target.closest('.tab[data-i]');
  if (tab) { dayIdx = +tab.dataset.i; overview = false; renderTrip(); }
};

$('#overviewDays').onclick = (e) => {
  const t = cur();
  if (e.target.closest('[data-act="addDay"]')) return $('#daysNav [data-act="addDay"]').click();
  const card = e.target.closest('.overview-day[data-day]');
  if (!card) return;
  dayIdx = +card.dataset.day; overview = false; renderTrip();
};

$('#overviewDays').onkeydown = (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.overview-day[data-day]');
  if (!card) return;
  e.preventDefault();
  dayIdx = +card.dataset.day; overview = false; renderTrip();
};

$('#dayHead').onclick = (e) => {
  const t = cur(), d = t.days[dayIdx];
  const sw = e.target.closest('[data-color]');
  if (sw) { d.color = sw.dataset.color; save(); return renderTrip(); }
  if (e.target.closest('[data-act="delDay"]')) {
    if (t.days.length === 1) return toast('A viagem precisa ter ao menos um dia.');
    if (!confirm(`Excluir “${d.name}” e suas paradas?`)) return;
    t.days.splice(dayIdx, 1); dayIdx = 0; save(); toast('Dia excluído.'); renderTrip();
  }
};
$('#dayHead').onchange = (e) => {
  if (e.target.id !== 'dayName') return;
  cur().days[dayIdx].name = e.target.value.trim() || 'Dia';
  save(); renderTrip();
};

$('#recalcDay').onclick = () => withBusy(() => routeDay(cur().days[dayIdx]), 'Dia recalculado.');
$('#recalcTrip').onclick = () => withBusy(async () => { for (const d of cur().days) await routeDay(d); }, 'Viagem recalculada.');

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
    toast(`Parada movida para ${target.name}.`, 'ok');
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
  if (b.dataset.act === 'icon') { iconEdit = iconEdit === b.dataset.id ? null : b.dataset.id; return renderTrip(); }
  if (b.dataset.act === 'pickIcon') {
    if (d.stops[idx].photo) d.stops[idx].originalPhoto = d.stops[idx].photo;
    d.stops[idx].icon = b.dataset.v;
    d.stops[idx].photo = '';
    iconEdit = null;
    save();
    return renderTrip();
  }
  if (b.dataset.act === 'restorePhoto') {
    const stop = d.stops[idx];
    if (stop.originalPhoto) {
      stop.photo = stop.originalPhoto;
      stop.icon = '';
      save();
      return renderTrip();
    }
    return withBusy(async () => {
      const w = await wikiInfo(stop.name);
      if (!w.photo) throw new Error('Nenhuma imagem encontrada para esta parada.');
      stop.originalPhoto = w.photo;
      stop.photo = w.photo;
      stop.icon = '';
      stop.desc = w.desc || stop.desc;
      stop.url = w.url || stop.url;
      save();
    }, 'Imagem restaurada.');
  }
  if (b.dataset.act === 'del') {
    d.stops.splice(idx, 1);
    fixLegs(d);
    toast('Parada removida.');
    if (d.stops.length && idx < d.stops.length) return reroute(d);
    save(); renderTrip();
  }
  if (b.dataset.act === 'idea') {
    const t = cur();
    const [s] = d.stops.splice(idx, 1);
    fixLegs(d);
    t.ideas.push({ id: s.id, name: s.name, lat: s.lat, lon: s.lon });
    toast('Parada movida para a lista de ideias.', 'ok');
    return reroute(d);
  }
};

Sortable.create($('#stops'), {
  animation: 160,
  handle: '.sh',
  ghostClass: 'drag-ghost',
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
  $('#results').innerHTML = '<li class="empty-line loading-results" role="status">Buscando lugares…</li>';
  try {
    lastResults = await searchPlaces(q);
    const targetDay = cur().days[dayIdx];
    $('#results').innerHTML = lastResults.map((p, i) => `
      <li>
        <span><b>${esc(p.name)}</b><br><small>${esc(p.address)}</small></span>
        <div class="result-actions">
          <button type="button" class="btn sm primary" data-act="addDay" data-i="${i}" aria-label="Adicionar ${esc(p.name)} a ${esc(targetDay.name)}">Adicionar</button>
          <button type="button" class="btn sm" data-act="addIdea" data-i="${i}">Guardar ideia</button>
        </div>
      </li>`).join('') || '<li class="empty-line">Nada encontrado. Tente um nome mais específico.</li>';
  } catch (err) {
    $('#results').innerHTML = `<li class="empty-line">Não foi possível buscar agora. Verifique sua conexão e tente novamente.</li>`;
    toast(err.message);
  }
};

$('#results').onclick = async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const place = lastResults[+b.dataset.i]; if (!place) return;
  const t = cur();
  // a busca some depois de escolher, para não atrapalhar a leitura do roteiro
  lastResults = [];
  $('#results').innerHTML = '';
  $('#q').value = '';

  if (b.dataset.act === 'addIdea') {
    t.ideas.push({ id: uid(), name: place.name, lat: place.lat, lon: place.lon });
    save(); renderTrip(); toast('Lugar salvo na lista de ideias.', 'ok');
    return;
  }
  const d = t.days[dayIdx];
  const stop = newStop(place);
  d.stops.push(stop);
  fixLegs(d);
  save(); renderTrip();
  toast(`“${place.name}” adicionado a ${d.name}.`, 'ok');
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
    const stop = newStop(p);
    d.stops.push(stop);
    fixLegs(d);
    save(); renderTrip();
    toast(`“${p.name}” adicionado a ${d.name}.`, 'ok');
    enrich(stop).then(() => { save(); renderTrip(); });
    if (d.stops.length > 1 && hasKey()) withBusy(() => legFor(d, d.stops.length - 1));
  }
};

// ---------- inicialização ----------
$('#brandName').textContent = CONFIG.APP_NAME || 'Mundo Afora';
initMap();
show(db.currentId && cur() ? 'trip' : 'home');
if (cur()) renderTrip(); else renderHome();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
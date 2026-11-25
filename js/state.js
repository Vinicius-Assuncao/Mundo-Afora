const KEY = 'mundo-afora.v1';
const $ = (s) => document.querySelector(s);

const EMOJIS = ['🌍','✈️','🏖️','🏔️','🏙️','🗺️','🚗','🚆','🚢','🏕️','🍽️','🎒','📸','🌅','🏝️','🏛️','🎢','🌋','🐘','🚴','🌸','❄️','🌵','🎉','🎓','⚽','🎭','🧘'];
let FLAGS = [
  ['br','Brasil'],['pt','Portugal'],['es','Espanha'],['fr','França'],['it','Itália'],['de','Alemanha'],
  ['gb','Reino Unido'],['ie','Irlanda'],['nl','Países Baixos'],['ch','Suíça'],['at','Áustria'],['gr','Grécia'],
  ['no','Noruega'],['se','Suécia'],['is','Islândia'],['tr','Turquia'],['ru','Rússia'],['us','Estados Unidos'],
  ['ca','Canadá'],['mx','México'],['ar','Argentina'],['cl','Chile'],['uy','Uruguai'],['pe','Peru'],['co','Colômbia'],
  ['jp','Japão'],['kr','Coreia do Sul'],['cn','China'],['in','Índia'],['th','Tailândia'],['ae','Emirados Árabes'],
  ['ma','Marrocos'],['eg','Egito'],['za','África do Sul'],['au','Austrália'],['nz','Nova Zelândia'],
];
const FLAGS_CACHE_KEY = 'mundo-afora.flags.v1';
let flagsPromise = null;
async function loadFlags() {
  if (flagsPromise) return flagsPromise;
  flagsPromise = (async () => {
    try {
      const cached = JSON.parse(localStorage.getItem(FLAGS_CACHE_KEY) || 'null');
      if (Array.isArray(cached) && cached.length > 100) FLAGS = cached;
    } catch {}
    try {
      const response = await fetch('https://flagcdn.com/pt/codes.json');
      if (!response.ok) throw new Error(`FlagCDN HTTP ${response.status}`);
      const data = await response.json();
      const entries = Object.entries(data).filter(([code, name]) => /^[a-z]{2}$/.test(code) && typeof name === 'string')
        .map(([code, name]) => [code, name]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
      if (entries.length > 100) { FLAGS = entries; localStorage.setItem(FLAGS_CACHE_KEY, JSON.stringify(entries)); }
    } catch (error) {
      flagsPromise = null;
      console.warn('[Mundo Afora] Não foi possível atualizar a lista de países:', error);
    }
    return FLAGS;
  })();
  return flagsPromise;
}
const validCustomEmoji = (value) => {
  const text = String(value || '').trim();
  if (!text || /\p{Regional_Indicator}/u.test(text)) return false;
  const parts = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((part) => part.segment)
    : Array.from(text);
  return parts.length === 1 && (/^[0-9#*]\uFE0F?\u20E3$/u.test(text) || /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(text));
};
const COLORS = ['#2f5d8a','#4a6fa5','#1f5f6b','#3d7a4f','#6b8e4e','#8b5e3c','#a0522d','#9a6b1f','#5c4033','#1a1a1a'];
const isHexColor = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ''));
function tripColor(trip) {
  const color = isHexColor(trip?.color) ? trip.color : trip?.days?.[0]?.color;
  return isHexColor(color) ? color : COLORS[0];
}
function shadeColor(hex, amount = 0.18) {
  const value = tripColor({ color: hex }).slice(1);
  const rgb = [0, 2, 4].map((i) => Math.round(parseInt(value.slice(i, i + 2), 16) * (1 - amount)));
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function tripColorInk(hex) {
  const value = tripColor({ color: hex }).slice(1);
  const rgb = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return luminance > 0.18 ? '#1d2935' : '#ffffff';
}
const MODES = {
  walk: { profile: 'foot-walking', label: 'A pé' },
  bike: { profile: 'cycling-regular', label: 'Bicicleta' },
  car:  { profile: 'driving-car', label: 'Carro' },
};

const ICON_EMOJIS = ['📍','🏛️','⛪','🏰','🗿','⛲','🌉','🚉','🎭','🖼️','🍽️','☕','🍦','🛍️','🌳','🏖️','🏟️','🌃','🏞️','🎡','🍷','🎶','🌅','🚠','🕰️','🗼','🧭','🎨','🛶'];
let iconEdit = null;
let stopRenameId = null;
let db = JSON.parse(localStorage.getItem(KEY) || 'null') || { trips: [], currentId: null };
let dayIdx = 0, overview = true, lastResults = [], editingId = null;
let picked = '🌍', pickerTab = 'emoji';
let map, layer;
const wikiBusy = new Set();

// ---------- utilidades ----------
const save = () => {
  if (typeof Cloud !== 'undefined') Cloud.touch();
  localStorage.setItem(KEY, JSON.stringify(db));
  if (typeof Cloud !== 'undefined') Cloud.changed();
};
const uid = () => Math.random().toString(36).slice(2, 10);
const cur = () => db.trips.find((t) => t.id === db.currentId);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function askConfirm({ title = 'Confirmar ação', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', icon = 'warning' }) {
  const dlg = $('#confirmDlg');
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  $('#confirmCancel').textContent = cancelText;
  $('#confirmAccept').textContent = confirmText;
  $('#confirmIcon').textContent = icon;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      dlg.close();
      resolve(accepted);
    };
    $('#confirmCancel').onclick = () => finish(false);
    $('#confirmAccept').onclick = () => finish(true);
    dlg.oncancel = (event) => { event.preventDefault(); finish(false); };
    dlg.showModal();
    setTimeout(() => $('#confirmCancel').focus(), 50);
  });
}
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
  return { id: uid(), name: place.name, wikiName: place.wikiName ?? place.name, wikidataId: place.wikidataId || '', wikipedia: place.wikipedia || '', lat: place.lat, lon: place.lon, time: '', stay: 60,
    transport: 'walk', desc: '', photo: '', originalPhoto: '', url: '', icon: '', wikiDone: false };
}
function sortedTrips() {
  return [...db.trips].sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999'));
}


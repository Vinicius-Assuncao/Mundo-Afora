// ---------- exportação: modelo de dados e utilitários ----------
// Converte uma viagem salva em um modelo somente leitura para os modelos visuais.
// Nunca altera a viagem original e só usa o que está cadastrado: o que não existe não é exibido.
const ExportModel = (() => {
  const MODE_INFO = {
    walk: { label: 'A pé', emoji: '🚶' },
    bike: { label: 'Bicicleta', emoji: '🚲' },
    car: { label: 'Carro', emoji: '🚗' },
  };

  // Emoji por categoria, deduzido apenas pelo nome da atração (o emoji escolhido pelo usuário tem prioridade).
  const CATEGORY_RULES = [
    [/museu|galeria|pinacoteca|museum|gallery/i, '🖼️'],
    [/mesquita|mosque/i, '🕌'],
    [/templo|temple/i, '🛕'],
    [/igreja|bas[ií]lica|catedral|capela|duomo|santu[aá]rio|church|cathedral|chiesa/i, '⛪'],
    [/castelo|castel|fortaleza|forte\b|castle/i, '🏰'],
    [/pal[aá]cio|palazzo|palace/i, '👑'],
    [/coliseu|colosseo|anfiteatro|f[oó]rum|ru[ií]nas|termas|terme|pante[aã]o|pantheon|aqueduto|catacumba/i, '🏛️'],
    [/fonte\b|fontana|fountain/i, '⛲'],
    [/ponte\b|ponte\s|bridge/i, '🌉'],
    [/torre\b|tower/i, '🗼'],
    [/parque|jardim|bosque|villa borghese|park\b|garden/i, '🌳'],
    [/praia|beach/i, '🏖️'],
    [/mirante|belvedere|terra[cç]o|colina|monte\b|vista/i, '🌅'],
    [/restaurante|trattoria|osteria|pizzaria|pizzeria|ristorante|bistr[oô]|cantina|almo[cç]o|jantar/i, '🍝'],
    [/caf[eé]|padaria|sorveteria|gelato|gelateria|confeitaria|bar\b/i, '☕'],
    [/mercado|mercato|market|feira|shopping|loja/i, '🛍️'],
    [/teatro|[oó]pera|cinema|audit[oó]rio/i, '🎭'],
    [/est[aá]dio|stadium|stadio/i, '🏟️'],
    [/esta[cç][aã]o|stazione|metr[oô]|aeroporto|airport|rodovi[aá]ria|terminal/i, '🚉'],
    [/hotel|hostel|pousada|albergo|hospedagem/i, '🏨'],
    [/p[ií]er|marina|cais|barco/i, '⛵'],
    [/pra[cç]a|piazza|largo\b|square|plaza/i, '🏙️'],
    [/monumento|est[aá]tua|memorial|obelisco|arco\b|coluna|colonna|monument/i, '🗿'],
    [/biblioteca|livraria|universidade/i, '📚'],
    [/funicular|telef[eé]rico|bondinho/i, '🚠'],
  ];
  function categoryEmoji(stop) {
    if (stop?.icon) return stop.icon;
    const name = String(stop?.name || '');
    for (const [re, emoji] of CATEGORY_RULES) if (re.test(name)) return emoji;
    return '📍';
  }

  // ---------- formatação ----------
  const minutes = (value) => {
    const m = Math.round(Number(value) || 0);
    if (m <= 0) return '';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
  };
  const km = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    return `${n.toLocaleString('pt-BR', { minimumFractionDigits: n < 10 ? 1 : 0, maximumFractionDigits: 1 })} km`;
  };
  const validTime = (v) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v).padStart(5, '0') : '');
  const addMinutes = (hhmm, add) => {
    if (!validTime(hhmm)) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const total = ((h * 60 + m + Math.round(add)) % 1440 + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const dateOf = (iso) => new Date(`${iso}T12:00`);
  const dateLong = (iso) => iso ? dateOf(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const dateShort = (iso) => iso ? dateOf(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : '';
  function periodLabel(start, end) {
    if (!start) return '';
    const a = dateOf(start), b = dateOf(end || start);
    const full = (d) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!end || end === start) return full(a);
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
      return `${a.getDate()} a ${full(b)}`;
    }
    if (a.getFullYear() === b.getFullYear()) {
      const m = (d) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
      return `${m(a)} a ${full(b)}`;
    }
    return `${full(a)} a ${full(b)}`;
  }
  function truncate(text, max) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-–]+$/, '')}…`;
  }
  const slug = (name) => String(name || 'viagem').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'viagem';

  // ---------- modelo ----------
  function buildStop(s, i) {
    const stay = Math.max(0, Math.round(Number(s.stay) || 0));
    const time = validTime(s.time);
    const mode = MODE_INFO[s.transport] ? s.transport : 'walk';
    const hasLeg = i > 0;
    const legMin = s.legMin != null && Number.isFinite(+s.legMin) ? +s.legMin : null;
    const legKm = s.legKm != null && Number.isFinite(+s.legKm) ? +s.legKm : null;
    return {
      id: s.id, n: i + 1, name: s.name || 'Parada', lat: s.lat, lon: s.lon,
      emoji: categoryEmoji(s), customIcon: !!s.icon,
      photo: s.photo || '', attribution: s.photoAttribution || null, photoCredit: s.photoCredit || '',
      time, endTime: time && stay ? addMinutes(time, stay) : '',
      stay, stayLabel: minutes(stay),
      leg: hasLeg ? {
        mode, label: MODE_INFO[mode].label, emoji: MODE_INFO[mode].emoji,
        minLabel: legMin != null ? minutes(legMin) : '', kmLabel: legKm != null ? km(legKm) : '',
      } : null,
    };
  }
  function buildDay(d, i) {
    const stops = (d.stops || []).map(buildStop);
    const tot = typeof totals === 'function' ? totals([d]) : { stops: stops.length, visit: 0, drive: 0, km: 0, pending: 0 };
    const generic = /^dia\s*\d+$/i.test(String(d.name || '').trim());
    return {
      id: d.id, index: i, number: i + 1, numberLabel: `Dia ${i + 1}`,
      name: d.name || `Dia ${i + 1}`, title: generic ? '' : (d.name || ''),
      date: d.date || '', dateLong: dateLong(d.date), dateShort: dateShort(d.date),
      color: d.color || '#2f5d8a', stops,
      visitLabel: minutes(tot.visit),
      driveLabel: !tot.pending && tot.drive > 0 ? minutes(tot.drive) : '',
      kmLabel: !tot.pending && tot.km > 0 ? km(tot.km) : '',
      emoji: stops[0]?.emoji || '📍',
      hasStops: stops.length > 0,
    };
  }
  function build(trip) {
    const days = (trip.days || []).map(buildDay);
    const tot = typeof totals === 'function' ? totals(trip.days || []) : { stops: 0, visit: 0, drive: 0, km: 0, pending: 0 };
    const withPhoto = days.flatMap((d) => d.stops.filter((s) => s.photo).map((s) => ({ stop: s, day: d })));
    const uploadedHero = trip.coverStopId === 'uploaded' && trip.coverPhoto
      ? { stop: { id: 'uploaded', name: trip.name || 'Minha viagem', photo: trip.coverPhoto, attribution: null, photoCredit: '' }, day: null }
      : null;
    const selectedHero = withPhoto.find((h) => h.stop.id === trip.coverStopId);
    const highlights = [];
    const seen = new Set();
    days.forEach((d) => {
      const first = d.stops.find((s) => s.photo && !seen.has(s.photo));
      if (first && highlights.length < 4) { highlights.push({ stop: first, day: d }); seen.add(first.photo); }
    });
    return {
      trip: { id: trip.id, name: trip.name || 'Minha viagem', emoji: trip.emoji || '🌍', start: trip.start || '', end: trip.end || '', period: periodLabel(trip.start, trip.end) },
      days,
      totals: {
        days: days.length, stops: tot.stops,
        visitLabel: minutes(tot.visit),
        driveLabel: !tot.pending && tot.drive > 0 ? minutes(tot.drive) : '',
        kmLabel: !tot.pending && tot.km > 0 ? km(tot.km) : '',
      },
      hero: uploadedHero || selectedHero || withPhoto[0] || null,
      highlights,
    };
  }

  // ---------- cores e contraste ----------
  const toRgb = (hex) => {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return Number.isFinite(n) && h.length === 6 ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
  };
  const toHex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
  const lum = (hex) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const [r, g, b] = toRgb(hex);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (a, b, t) => { const x = toRgb(a), y = toRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const onColor = (hex) => (lum(hex) > 0.42 ? '#1b2530' : '#ffffff');
  // garante que a cor de texto seja legível sobre o fundo escolhido
  const readable = (fg, bg, ink, min = 3.4) => {
    let c = fg;
    for (let i = 0; i < 4 && contrast(c, bg) < min; i++) c = mix(c, ink, 0.4);
    return c;
  };
  function themeStyle({ main, bg, accent }) {
    const ink = lum(bg) > 0.42 ? '#1d2935' : '#f3f5f7';
    const card = lum(bg) > 0.42 ? '#ffffff' : mix(bg, '#ffffff', 0.08);
    const vars = {
      main, bg, accent, ink, card,
      heading: readable(main, bg, ink),
      'accent-text': readable(accent, bg, ink),
      muted: mix(ink, bg, 0.42),
      line: mix(ink, bg, 0.84),
      soft: mix(main, bg, 0.9),
      'soft-accent': mix(accent, bg, 0.86),
      onmain: onColor(main),
      onaccent: onColor(accent),
    };
    return Object.entries(vars).map(([k, v]) => `--xp-${k}:${v}`).join(';');
  }

  return { build, categoryEmoji, minutes, km, truncate, slug, themeStyle, mix, lum, onColor, periodLabel, MODE_INFO };
})();

// ---------- exportação: modelos visuais ----------
// Cada modelo monta sua própria estrutura HTML (capa, visão geral e dias).
// O contexto (ctx) entrega opções, imagens já tratadas e dados da viagem; nada é inventado aqui.
const ExportTemplates = (() => {
  const E = (v) => esc(v);
  const T = ExportModel;

  // ---------- trechos compartilhados ----------
  const timeText = (ctx, s) => (ctx.opts.times && s.time ? (s.endTime && ctx.opts.duration ? `${s.time} – ${s.endTime}` : s.time) : '');
  const stayText = (ctx, s) => (ctx.opts.duration ? s.stayLabel : '');
  const legText = (ctx, s) => (ctx.opts.legs && s.leg
    ? [`${s.leg.emoji} ${s.leg.label}`, s.leg.minLabel, s.leg.kmLabel].filter(Boolean).join(' · ') : '');
  const bg = (src) => (src ? `background-image:url('${src}')` : '');
  const photoBox = (ph, cls, s) => `<div class="xp-photo ${cls} ${ph ? (ph.loading ? 'is-loading' : '') : 'is-empty'}" style="${ph ? bg(ph.src) : ''}">${ph ? '' : `<span>${E(s.emoji)}</span>`}</div>`;
  const pad2 = (n) => String(n).padStart(2, '0');

  function summaryParts(ctx, d) {
    const o = ctx.opts;
    const parts = [`${d.stops.length} ${d.stops.length === 1 ? 'parada' : 'paradas'}`];
    if (o.duration && d.visitLabel && d.stops.length) parts.push(`${d.visitLabel} de visitas`);
    if (o.legs && d.driveLabel) parts.push(`${d.driveLabel} de deslocamento`);
    if (o.legs && d.kmLabel) parts.push(d.kmLabel);
    return parts;
  }
  function overviewStats(ctx) {
    const t = ctx.model.totals, o = ctx.opts;
    const out = [[t.days, t.days === 1 ? 'dia' : 'dias'], [t.stops, t.stops === 1 ? 'parada' : 'paradas']];
    if (o.duration && t.visitLabel) out.push([t.visitLabel, 'de visitas']);
    if (o.legs && t.kmLabel) out.push([t.kmLabel, 'percorridos']);
    else if (o.legs && t.driveLabel) out.push([t.driveLabel, 'em deslocamento']);
    return out;
  }
  function mapBlock(ctx, day, h0, cls, caption = '') {
    if (!ctx.opts.maps) return '';
    const h = ctx.fmt.dense ? Math.round(h0 * 0.8) : h0; // imagens de altura fixa (Stories/Feed): mapa mais compacto
    const m = ctx.mapOf(day, h);
    if (!m) return '';
    return `<div class="xp-mapwrap ${cls}"><div class="xp-map ${m.loading ? 'is-loading' : ''}" style="height:${h}px;${bg(m.src)}"></div>${caption ? `<div class="xp-mapcap">${E(caption)}</div>` : ''}</div>`;
  }
  const dayTitle = (d) => d.title || d.numberLabel;
  const dayKicker = (d) => (d.title ? `${d.numberLabel}${d.dateLong ? ` · ${d.dateLong}` : ''}` : d.dateLong);

  // ======================================================= ELEGANTE
  const elegante = {
    id: 'elegante', name: 'Elegante', blurb: 'Minimalista, com tipografia clássica e muito respiro.',
    palette: { main: '#24323f', bg: '#fbf9f5', accent: '#b08a4f' },
    layout: (d) => ({ pt: 70, pb: 62, px: 60, gap: d ? 14 : 22 }),
    chrome: (ctx, i) => ({
      top: `<div class="e-run"><span>${E(ctx.model.trip.name)}</span><span>${E(i.sub || '')}</span></div>`,
      bottom: i.showNum ? `<div class="e-pg">— ${i.n} —</div>` : '',
    }),
    cover(ctx) {
      const hero = ctx.hero();
      const t = ctx.model.trip, o = ctx.opts;
      const stats = overviewStats(ctx).slice(0, 3).map(([v, l]) => `<div class="e-stat"><b>${E(v)}</b><span>${E(l)}</span></div>`).join('');
      return `<div class="e-cover">
        <div><div class="e-kicker">Roteiro de viagem</div><h1 class="e-title">${E(t.name)}</h1><div class="e-rule"></div>
          <div class="e-period">${E(t.period || '')}</div></div>
        <div class="e-hero ${hero ? '' : 'e-orn'}" style="${hero ? bg(hero.src) : ''}">${hero ? '' : `<span>${ctx.iconHtml(110)}</span>`}</div>
        <div class="e-stats">${o.cover ? stats : ''}</div></div>`;
    },
    day(ctx, d) {
      const sum = summaryParts(ctx, d).join('  ·  ');
      return {
        head: `<header class="e-dayhead"><div class="e-num">${pad2(d.number)}</div>
          <div class="e-dtxt"><div class="e-dkick">${E(dayKicker(d))}</div><h2 class="e-dtitle">${E(dayTitle(d))}</h2></div></header>
          <div class="e-sum">${E(sum)}</div>`,
        cont: `<div class="e-cont"><b>${pad2(d.number)}</b> ${E(dayTitle(d))} <i>continuação</i></div>`,
        map: d.hasStops ? mapBlock(ctx, d, 210, 'e-map') : '',
        items: d.stops.map((s) => {
          const t = timeText(ctx, s), meta = [stayText(ctx, s)].filter(Boolean).join(' · '), leg = legText(ctx, s);
          const ph = ctx.photoOf(s);
          return `<article class="e-stop" style="--xp-day:${d.color}">
            ${leg ? `<div class="e-leg"><span class="e-legline"></span><span>${E(leg)}</span></div>` : ''}
            <div class="e-row"><div class="e-n">${s.n}</div>
              <div class="e-info">${t ? `<div class="e-time">${E(t)}</div>` : ''}<h3 class="e-name">${E(s.name)}</h3>
                ${meta ? `<div class="e-meta">${E(meta)}</div>` : ''}</div>
              ${ctx.opts.photos ? photoBox(ph, 'e-thumb', s) : ''}</div></article>`;
        }),
        foot: '',
      };
    },
    overview(ctx) {
      const t = ctx.model.trip;
      const stats = overviewStats(ctx).map(([v, l]) => `<div class="e-stat"><b>${E(v)}</b><span>${E(l)}</span></div>`).join('');
      const hl = ctx.opts.photos ? ctx.highlights() : [];
      return {
        head: `<header><div class="e-dkick">Visão geral</div><h2 class="e-dtitle e-big">${E(t.name)}</h2><div class="e-period">${E(t.period || '')}</div></header>
          <div class="e-stats e-stats-ov">${stats}</div>
          ${hl.length ? `<div class="e-hl">${hl.map((h) => `<figure>${photoBox(h.ph, 'e-hlph', h.stop)}<figcaption>${E(h.stop.name)}</figcaption></figure>`).join('')}</div>` : ''}`,
        cont: `<div class="e-cont"><b>Visão geral</b> <i>continuação</i></div>`,
        map: mapBlock(ctx, null, 230, 'e-map'),
        items: ctx.model.days.map((d) => `<div class="e-orow"><span class="e-on">${pad2(d.number)}</span>
          <div class="e-otx"><b>${E(dayTitle(d))}</b><small>${E([d.dateLong, d.stops.slice(0, 3).map((s) => s.name).join(' · ')].filter(Boolean).join('  —  '))}</small></div>
          <span class="e-oc">${d.stops.length} ${d.stops.length === 1 ? 'parada' : 'paradas'}</span></div>`),
        foot: '',
      };
    },
  };

  // ======================================================= ORGANIZADO
  const organizado = {
    id: 'organizado', name: 'Organizado', blurb: 'Agenda com linha do tempo, horários em destaque e blocos claros.',
    palette: { main: '#2f5d8a', bg: '#f3f6f9', accent: '#2a8a78' },
    layout: (d) => ({ pt: 66, pb: 58, px: 48, gap: d ? 10 : 16 }),
    chrome: (ctx, i) => ({
      top: `<div class="o-run"><b>${E(ctx.model.trip.name)}</b><span>${E(i.sub || '')}</span></div>`,
      bottom: i.showNum ? `<div class="o-pg">Página ${i.n} de ${i.total}</div>` : '',
    }),
    cover(ctx) {
      const t = ctx.model.trip;
      const tiles = [['Período', t.period || '—'], ...overviewStats(ctx).map(([v, l]) => [l, v])].slice(0, 4);
      const hero = ctx.hero();
      return `<div class="o-cover">
        <div class="o-cband"><div class="o-ctag">ROTEIRO DE VIAGEM</div><h1>${E(t.name)}</h1>
          <div class="o-cicon">${ctx.iconHtml(54)}</div></div>
        <div class="o-ctiles">${tiles.map(([l, v]) => `<div class="o-tile"><span>${E(l)}</span><b>${E(v)}</b></div>`).join('')}</div>
        ${hero ? `<div class="o-chero" style="${bg(hero.src)}"></div>` : ''}
        <div class="o-cdays"><div class="o-cdh">Dias do roteiro</div>${ctx.model.days.slice(0, 8).map((d) =>
          `<div class="o-cd" style="--xp-day:${d.color}"><i></i><b>${E(d.numberLabel)}</b><span>${E(d.title || d.dateLong || '')}</span><em>${d.stops.length}</em></div>`).join('')}</div></div>`;
    },
    day(ctx, d) {
      const tiles = [[`${d.stops.length}`, d.stops.length === 1 ? 'parada' : 'paradas']];
      if (ctx.opts.duration && d.visitLabel) tiles.push([d.visitLabel, 'de visitas']);
      if (ctx.opts.legs && d.driveLabel) tiles.push([d.driveLabel, 'deslocamento']);
      if (ctx.opts.legs && d.kmLabel) tiles.push([d.kmLabel, 'distância']);
      return {
        head: `<header class="o-dhead" style="--xp-day:${d.color}"><div class="o-dbadge">${E(d.numberLabel.toUpperCase())}</div>
          <div class="o-dtx"><h2>${E(dayTitle(d))}</h2>${d.dateLong ? `<span>${E(d.dateLong)}</span>` : ''}</div></header>
          <div class="o-dsum">${tiles.map(([v, l]) => `<div><b>${E(v)}</b><span>${E(l)}</span></div>`).join('')}</div>`,
        cont: `<div class="o-dcont" style="--xp-day:${d.color}"><b>${E(d.numberLabel)}</b> ${E(d.title)} <i>continuação</i></div>`,
        map: d.hasStops ? mapBlock(ctx, d, 220, 'o-map') : '',
        items: d.stops.map((s) => {
          const t = timeText(ctx, s), leg = legText(ctx, s), st = stayText(ctx, s);
          const ph = ctx.photoOf(s);
          return `<article class="o-stop" style="--xp-day:${d.color}">
            <div class="o-tcol">${s.time && ctx.opts.times ? `<b>${E(s.time)}</b>${s.endTime && ctx.opts.duration ? `<small>até ${E(s.endTime)}</small>` : ''}` : `<b class="o-notime">—</b>`}</div>
            <div class="o-rail"><span>${s.n}</span></div>
            <div class="o-body">
              ${leg ? `<div class="o-leg">${E(leg)}</div>` : ''}
              <div class="o-card"><div class="o-ctx"><h3>${E(s.name)}</h3>
                <div class="o-chips"><span>${E(s.emoji)}</span>${st ? `<span>⏱ ${E(st)}</span>` : ''}</div>
              </div>
                ${ctx.opts.photos ? photoBox(ph, 'o-ph', s) : ''}</div></div></article>`;
        }),
        foot: '',
      };
    },
    overview(ctx) {
      const t = ctx.model.trip;
      const hl = ctx.opts.photos ? ctx.highlights() : [];
      return {
        head: `<header class="o-dhead o-ovhead"><div class="o-dbadge">VISÃO GERAL</div><div class="o-dtx"><h2>${E(t.name)}</h2>${t.period ? `<span>${E(t.period)}</span>` : ''}</div></header>
          <div class="o-dsum">${overviewStats(ctx).map(([v, l]) => `<div><b>${E(v)}</b><span>${E(l)}</span></div>`).join('')}</div>
          ${hl.length ? `<div class="o-hl">${hl.map((h) => photoBox(h.ph, 'o-hlph', h.stop)).join('')}</div>` : ''}`,
        cont: `<div class="o-dcont"><b>Visão geral</b> <i>continuação</i></div>`,
        map: mapBlock(ctx, null, 240, 'o-map'),
        items: ctx.model.days.map((d) => `<div class="o-orow" style="--xp-day:${d.color}"><i></i>
          <div class="o-otx"><b>${E(d.numberLabel)}${d.title ? ` · ${E(d.title)}` : ''}</b><small>${E([d.dateLong, d.stops.slice(0, 3).map((s) => s.name).join(' · ')].filter(Boolean).join('  —  '))}</small></div>
          <span>${d.stops.length}</span></div>`),
        foot: '',
      };
    },
  };

  // ======================================================= COLORIDO
  const VIVID = ['#ff6b4a', '#2ec4b6', '#ffb703', '#8e7dff', '#ef476f', '#3a86ff', '#06d6a0', '#f77f00'];
  const vivid = (ctx, i) => (i === 0 ? ctx.colors.main : i === 1 ? ctx.colors.accent : VIVID[i % VIVID.length]);
  const dayVars = (col) => `--xp-day:${col};--xp-day2:${T.mix(col, '#ffffff', 0.3)};--xp-dayon:${T.onColor(col)}`;
  const colorido = {
    id: 'colorido', name: 'Colorido', blurb: 'Descontraído, com cards, emojis e cores vivas. Ótimo para compartilhar.',
    palette: { main: '#ff6b4a', bg: '#fff8ee', accent: '#2ec4b6' },
    layout: (d) => ({ pt: 58, pb: 68, px: 44, gap: d ? 12 : 18 }),
    chrome: (ctx, i) => ({
      top: `<div class="c-run"><span>${E(ctx.model.trip.emoji.startsWith('flag:') ? '🌍' : ctx.model.trip.emoji)} ${E(ctx.model.trip.name)}</span><span>${E(i.sub || '')}</span></div>`,
      bottom: i.showNum ? `<div class="c-pg">${i.n}</div>` : '',
    }),
    cover(ctx) {
      const t = ctx.model.trip, hero = ctx.hero();
      const chips = overviewStats(ctx).map(([v, l]) => `<span>${E(v)} ${E(l)}</span>`).join('');
      return `<div class="c-cover"><i class="c-b1"></i><i class="c-b2"></i><i class="c-b3"></i><i class="c-b4"></i>
        <div class="c-cin"><div class="c-cicon">${ctx.iconHtml(96)}</div>
          <div class="c-ckick">✈️ vamos nessa!</div><h1>${E(t.name)}</h1>
          ${t.period ? `<div class="c-cper">🗓️ ${E(t.period)}</div>` : ''}
          <div class="c-cchips">${chips}</div></div>
        ${hero ? `<div class="c-chero" style="${bg(hero.src)}"></div>` : ''}</div>`;
    },
    day(ctx, d) {
      const col = vivid(ctx, d.index);
      const sum = summaryParts(ctx, d);
      return {
        head: `<header class="c-dhead" style="${dayVars(col)}"><div class="c-dem">${E(d.emoji)}</div>
          <div class="c-dtx"><span class="c-dtag">${E(d.numberLabel)}</span><h2>${E(dayTitle(d))}</h2>${d.dateLong ? `<small>${E(d.dateLong)}</small>` : ''}</div>
          <div class="c-dsum">${sum.map((p) => `<span>${E(p)}</span>`).join('')}</div></header>`,
        cont: `<div class="c-dcont" style="${dayVars(col)}">${E(d.emoji)} <b>${E(d.numberLabel)}</b> ${E(d.title)} <i>continuação</i></div>`,
        map: d.hasStops ? mapBlock(ctx, d, 210, 'c-map') : '',
        items: d.stops.map((s) => {
          const t = timeText(ctx, s), leg = legText(ctx, s), st = stayText(ctx, s);
          const ph = ctx.photoOf(s);
          return `<article class="c-stop" style="${dayVars(col)}">
            ${leg ? `<div class="c-leg">${E(leg)}</div>` : ''}
            <div class="c-card"><div class="c-emo">${E(s.emoji)}<b>${s.n}</b></div>
              <div class="c-tx"><h3>${E(s.name)}</h3>
                <div class="c-chips">${t ? `<span class="c-time">🕒 ${E(t)}</span>` : ''}${st ? `<span>⏱ ${E(st)}</span>` : ''}</div>
              </div>
              ${ctx.opts.photos ? photoBox(ph, 'c-ph', s) : ''}</div></article>`;
        }),
        foot: '',
      };
    },
    overview(ctx) {
      const t = ctx.model.trip;
      const bubbles = overviewStats(ctx).map(([v, l], i) => `<div class="c-bub" style="${dayVars(vivid(ctx, i + 2))}"><b>${E(v)}</b><span>${E(l)}</span></div>`).join('');
      const hl = ctx.opts.photos ? ctx.highlights() : [];
      return {
        head: `<header class="c-ovhead"><div class="c-dtag">VISÃO GERAL</div><h2>${E(t.name)}</h2>${t.period ? `<small>🗓️ ${E(t.period)}</small>` : ''}</header>
          <div class="c-bubs">${bubbles}</div>
          ${hl.length ? `<div class="c-hl">${hl.map((h, i) => `<div class="c-hlw" style="${dayVars(vivid(ctx, i))}">${photoBox(h.ph, 'c-hlph', h.stop)}</div>`).join('')}</div>` : ''}`,
        cont: `<div class="c-dcont">🌍 <b>Visão geral</b> <i>continuação</i></div>`,
        map: mapBlock(ctx, null, 230, 'c-map'),
        items: ctx.model.days.map((d) => `<div class="c-orow" style="${dayVars(vivid(ctx, d.index))}"><div class="c-oem">${E(d.emoji)}</div>
          <div class="c-otx"><b>${E(d.numberLabel)}${d.title ? ` · ${E(d.title)}` : ''}</b><small>${E([d.dateShort, d.stops.slice(0, 3).map((s) => s.name).join(' · ')].filter(Boolean).join(' — '))}</small></div>
          <span>${d.stops.length}</span></div>`),
        foot: '',
      };
    },
  };

  // ======================================================= DIÁRIO DE VIAGEM
  const tilt = (i) => [-2.4, 1.8, -1.2, 2.6, -2][i % 5];
  const diario = {
    id: 'diario', name: 'Diário de viagem', blurb: 'Scrapbook com polaroids e fitas.',
    palette: { main: '#5b4636', bg: '#f4ecd8', accent: '#c4523a' },
    layout: (d) => ({ pt: 62, pb: 62, px: 56, gap: d ? 14 : 20 }),
    chrome: (ctx, i) => ({
      top: `<div class="d-run">${E(ctx.model.trip.name)} · ${E(i.sub || '')}</div>`,
      bottom: i.showNum ? `<div class="d-pg">pág. ${i.n}</div>` : '',
    }),
    cover(ctx) {
      const t = ctx.model.trip, hero = ctx.hero();
      const line = overviewStats(ctx).slice(0, 3).map(([v, l]) => `${v} ${l}`).join(', ');
      return `<div class="d-cover">
        <div class="d-clabel">diário de viagem</div>
        <div class="d-cpol"><i class="d-tape"></i>${hero ? `<div class="d-cimg" style="${bg(hero.src)}"></div>` : `<div class="d-cimg d-cemo">${ctx.iconHtml(120)}</div>`}
          <div class="d-ccap">${E(hero ? hero.stop.name : t.name)}</div></div>
        <h1 class="d-ctitle">${E(t.name)}</h1>
        ${t.period ? `<div class="d-cstamp">${E(t.period)}</div>` : ''}
        <div class="d-cline">${E(line)} ✈️</div></div>`;
    },
    day(ctx, d) {
      const sum = summaryParts(ctx, d).join(' · ');
      return {
        head: `<header class="d-dhead"><div class="d-dtape">${E(d.numberLabel)}</div>
          <h2>${E(dayTitle(d))}</h2>${d.dateLong ? `<div class="d-ddate">${E(d.dateLong)}</div>` : ''}<div class="d-dsum">${E(sum)}</div></header>`,
        cont: `<div class="d-dcont"><b>${E(d.numberLabel)}</b> ${E(d.title)} <i>(continuação)</i></div>`,
        map: d.hasStops && ctx.opts.maps ? mapBlock(ctx, d, 176, 'd-map', 'nosso caminho') : '',
        items: d.stops.map((s, i) => {
          const t = timeText(ctx, s), leg = legText(ctx, s), st = stayText(ctx, s);
          const ph = ctx.photoOf(s);
          const note = (ctx.opts.photos
            ? `<div class="d-pol" style="transform:rotate(${tilt(d.index + i)}deg)"><i class="d-tape"></i>${photoBox(ph, 'd-pimg', s)}<div class="d-pcap">${E(T.truncate(s.name, 24))}</div></div>`
            : '');
          return `<article class="d-stop ${i % 2 ? 'd-alt' : ''}">
            ${leg ? `<div class="d-leg">${E(leg)}</div>` : ''}
            <div class="d-row">${note}
              <div class="d-tx"><div class="d-n">${s.n}</div><h3>${E(s.name)}</h3>
                ${t || st ? `<div class="d-meta">${E([t, st].filter(Boolean).join(' · '))}</div>` : ''}
              </div></div></article>`;
        }),
        foot: '',
      };
    },
    overview(ctx) {
      const t = ctx.model.trip;
      const hl = ctx.opts.photos ? ctx.highlights() : [];
      return {
        head: `<header class="d-dhead"><div class="d-dtape">visão geral</div><h2>${E(t.name)}</h2>${t.period ? `<div class="d-ddate">${E(t.period)}</div>` : ''}
          <div class="d-stamps">${overviewStats(ctx).map(([v, l]) => `<span><b>${E(v)}</b> ${E(l)}</span>`).join('')}</div></header>
          ${hl.length ? `<div class="d-hl">${hl.map((h, i) => `<div class="d-pol" style="transform:rotate(${tilt(i)}deg)"><i class="d-tape"></i>${photoBox(h.ph, 'd-pimg d-small', h.stop)}<div class="d-pcap">${E(T.truncate(h.stop.name, 20))}</div></div>`).join('')}</div>` : ''}`,
        cont: `<div class="d-dcont"><b>Visão geral</b> <i>(continuação)</i></div>`,
        map: mapBlock(ctx, null, 160, 'd-map', 'por onde passamos'),
        items: ctx.model.days.map((d) => `<div class="d-orow"><span class="d-chk">✓</span><b><em>${E(d.numberLabel)}</em>${d.title ? ` — ${E(d.title)}` : ''}</b>
          <small>${E([d.dateShort, d.stops.slice(0, 3).map((s) => s.name).join(', ')].filter(Boolean).join(' · '))}</small></div>`),
        foot: '',
      };
    },
  };

  const list = [elegante, organizado, colorido, diario];
  return { list, get: (id) => list.find((t) => t.id === id) || elegante };
})();

// ---------- exportação: paginação, renderização e geração dos arquivos ----------
// Fluxo: modelo da viagem -> seções (capa, visão geral, dias, créditos) -> medição real dos blocos
// num iframe isolado -> páginas sem cortes -> html2canvas -> PNG/JPEG -> PDF ou ZIP.
const ExportEngine = (() => {
  const A = ExportAssets;
  const M = ExportModel;

  const FORMATS = {
    a4: { id: 'a4', kind: 'pdf', label: 'A4', w: 794, h: 1123, scale: 2, pt: [595.28, 841.89] },
    letter: { id: 'letter', kind: 'pdf', label: 'Carta', w: 816, h: 1056, scale: 2, pt: [612, 792] },
    stories: { id: 'stories', kind: 'png', label: 'Stories', w: 720, h: 1280, scale: 1.5, dense: true, coverH: 1280 },
    feed: { id: 'feed', kind: 'png', label: 'Feed 4:5', w: 720, h: 900, scale: 1.5, dense: true, coverH: 900 },
    long: { id: 'long', kind: 'png', label: 'Longo', w: 720, h: null, scale: 1.5, maxH: 9000, minH: 520, coverH: 1100 },
  };
  const MAX_PIXELS = 16e6; // limite seguro de área de canvas (iOS/Safari)

  let frame = null;
  async function ensureFrame() {
    if (frame) return frame;
    frame = await A.createFrame({ visible: false });
    await A.ensureFonts(frame.doc);
    return frame;
  }
  function dispose() { frame?.frame.remove(); frame = null; }
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const checkAbort = (signal) => { if (signal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError'); };

  function formatFor(state) { return FORMATS[state.format === 'pdf' ? state.paper : state.png] || FORMATS.a4; }
  const coverOn = (state) => (state.format === 'pdf' ? state.opts.coverPdf : state.opts.coverPng);

  // ---------- contexto entregue aos modelos ----------
  function makeCtx(state, trip, model, fmt, extra = {}) {
    const tpl = ExportTemplates.get(state.template);
    const colors = { ...state.colors };
    const o = state.opts;
    const bodyW = fmt.w - tpl.layout(0).px * 2;
    const ctx = {
      model, trip, fmt, colors, tpl, bodyW, section: '', activeKeys: extra.activeKeys || null,
      opts: { maps: o.maps, photos: o.photos, times: o.times, duration: o.duration, legs: o.legs, cover: coverOn(state) },
      photoOf(stop) {
        if (!o.photos || !stop?.photo) return null;
        if (stop.photo.startsWith('data:image/')) return { src: stop.photo };
        const e = A.photo(stop.photo);
        if (e.state === 'ready') return { src: e.data };
        return e.state === 'loading' ? { loading: true, src: '' } : null;
      },
      coverPhotoOf(stop) {
        if (!stop?.photo) return null;
        if (stop.photo.startsWith('data:image/')) return { src: stop.photo };
        const e = A.photo(stop.photo);
        if (e.state === 'ready') return { src: e.data };
        return e.state === 'loading' ? { loading: true, src: '' } : null;
      },
      hero() {
        const h = model.hero;
        const p = h && ctx.coverPhotoOf(h.stop);
        return p && p.src ? { src: p.src, stop: h.stop } : null;
      },
      highlights() {
        return model.highlights.map((h) => ({ ...h, ph: ctx.photoOf(h.stop) })).filter((h) => h.ph);
      },
      iconHtml(size) {
        const v = model.trip.emoji;
        if (v.startsWith('flag:')) {
          const e = A.photo(flagUrl(v.slice(5), 160));
          if (e.state === 'ready') return `<span style="display:inline-block;width:${Math.round(size * 1.35)}px;height:${Math.round(size * 0.92)}px;border-radius:8px;background:url('${e.data}') center/cover;box-shadow:0 0 0 1px rgba(0,0,0,.12)"></span>`;
          return `<span style="font-size:${size}px">🌍</span>`;
        }
        return `<span style="font-size:${size}px;line-height:1">${esc(v)}</span>`;
      },
      mapOf(day, h) {
        if (!o.maps) return null;
        const rawDays = day ? trip.days.filter((d) => d.id === day.id) : trip.days;
        const groups = rawDays.map((d) => ({
          color: d.color || '#2f5d8a',
          stops: (d.stops || []).filter((s) => Number.isFinite(+s.lat) && Number.isFinite(+s.lon)).map((s, i) => ({ lat: +s.lat, lon: +s.lon, n: i + 1 })),
          legs: (d.stops || []).map((s) => s.legGeo || null),
        })).filter((g) => g.stops.length);
        if (!groups.length) return null;
        if (ctx.activeKeys && !ctx.activeKeys.has(ctx.section)) return { loading: true, src: '' }; // prévia: só carrega o que está visível
        const sig = groups.map((g) => g.color + g.stops.map((s) => `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`).join(';') + g.legs.map((l) => (l ? l.length : 0)).join('.')).join('|');
        const padding = day ? 46 : 30;
        const key = `${day ? day.id : 'all'}|${ctx.bodyW}x${h}|p${padding}|${sig}`;
        ctx.mapKeys?.add(key);
        const e = A.map(key, { groups, width: ctx.bodyW, height: h, scale: 2, padding });
        return e.state === 'ready' ? { src: e.data } : e.state === 'loading' ? { loading: true, src: '' } : null;
      },
    };
    return ctx;
  }

  // ---------- seções ----------
  function selectedDays(state, model) {
    if (state.scope === 'trip') return model.days;
    if (state.scope === 'day') return model.days.filter((d) => d.id === state.oneDay);
    if (state.scope === 'days') return model.days.filter((d) => state.days.includes(d.id));
    return [];
  }
  function sectionsFor(state, model) {
    const pdf = state.format === 'pdf';
    const out = [];
    if (coverOn(state) && (pdf || state.scope === 'trip')) out.push({ key: 'cover', kind: 'cover', label: 'Capa', sub: '' });
    if (state.scope === 'overview' || (pdf && state.scope === 'trip')) out.push({ key: 'overview', kind: 'overview', label: pdf ? 'Visão geral' : 'Resumo geral', sub: 'Visão geral' });
    selectedDays(state, model).forEach((d) => out.push({
      key: `day:${d.id}`, kind: 'day', day: d,
      label: `${d.numberLabel}${d.title ? ` · ${d.title}` : ''}`, sub: `${d.numberLabel}${d.title ? ` · ${d.title}` : ''}`,
    }));
    return out;
  }
  function creditStrip(ctx, section) {
    const stops = section.kind === 'cover' ? [ctx.model.hero?.stop].filter(Boolean)
      : section.kind === 'day' ? section.day.stops
      : section.kind === 'overview' ? [ctx.model.hero?.stop, ...ctx.model.highlights.map((h) => h.stop)].filter(Boolean) : [];
    const seen = new Set(), items = [];
    stops.forEach((st) => {
      const photo = section.kind === 'cover' ? ctx.coverPhotoOf(st) : ctx.photoOf(st);
      if (!photo?.src || seen.has(st.photo)) return;
      seen.add(st.photo);
      const a = st.attribution;
      const credit = a?.author ? [a.author, a.license].filter(Boolean).join(' · ') : (a?.credit || st.photoCredit);
      if (credit) items.push(esc(M.truncate(credit, 40)));
    });
    const shown = items.slice(0, 9);
    return shown.length ? `<div class="xp-credstrip"><b>Fotos: Wikimedia Commons.</b> ${shown.join(' • ')}${items.length > shown.length ? ' • e outros' : ''}</div>` : '';
  }

  // ---------- montagem das páginas ----------
  const rootClass = (tpl, fmt, density, kind, extra = '') => `xp xp-t-${tpl.id} xp-d${density} xp-f-${fmt.id} xp-k-${kind} ${extra}`;
  function rootStyle(ctx, fmt, L, height) {
    return `${M.themeStyle(ctx.colors)};--xp-w:${fmt.w}px;--xp-h:${height}px;--xp-pt:${L.pt}px;--xp-pb:${L.pb}px;--xp-px:${L.px}px;--xp-gap:${L.gap}px;--xp-strip:${L.strip || 0}px`;
  }
  const wrap = (html) => `<div class="xp-blk">${html}</div>`;

  async function measure(ctx, fmt, density, blocks) {
    const { doc } = await ensureFrame();
    const L = ctx.tpl.layout(density);
    const root = doc.getElementById('root');
    root.innerHTML = `<div class="${rootClass(ctx.tpl, fmt, density, 'measure', 'xp-measure')}" style="${rootStyle(ctx, fmt, L, 'auto')}"><div class="xp-body">${blocks.map((b) => wrap(b.html)).join('')}</div></div>`;
    const heights = [...root.querySelectorAll('.xp-body > .xp-blk')].map((el) => el.getBoundingClientRect().height);
    root.innerHTML = '';
    return heights;
  }
  const sumH = (list, gap) => list.reduce((n, b) => n + b.h, 0) + gap * Math.max(0, list.length - 1);

  function pack(blocks, avail, gap) {
    const cont = blocks.find((b) => b.k === 'cont');
    const optional = blocks.filter((b) => b.k === 'opt'); // complementos (ex.: caixa de anotações): nunca criam página própria
    const body = blocks.filter((b) => b.k !== 'cont' && b.k !== 'opt' && b.k !== 'strip');
    const lead = body.filter((b) => b.k === 'head' || b.k === 'map');
    const items = body.filter((b) => b.k === 'item');
    const tail = body.filter((b) => b.k === 'tail');
    const units = [];
    // cabeçalho + mapa + primeiro item ficam juntos; o último item fica com o rodapé
    const first = items[0];
    if (first && sumH([...lead, first], gap) <= avail) { units.push([...lead, first]); items.shift(); }
    else if (lead.length) units.push(lead);
    if (items.length && tail.length) {
      const group = [items[items.length - 1], ...tail];
      if (sumH(group, gap) <= avail) { items.pop(); items.forEach((b) => units.push([b])); units.push(group); }
      else { items.forEach((b) => units.push([b])); tail.forEach((b) => units.push([b])); }
    } else { items.forEach((b) => units.push([b])); tail.forEach((b) => units.push([b])); }

    const pages = [];
    let cur = { blocks: [], used: 0, hasBody: false };
    const queue = [...units];
    while (queue.length) {
      const unit = queue.shift();
      let need = sumH(unit, gap) + (cur.blocks.length ? gap : 0);
      if (cur.used + need > avail + 0.5 && cur.hasBody) {
        // grupo (item + rodapé) maior que o espaço restante: o item fica nesta página e o rodapé segue adiante
        let k = unit.length - 1;
        while (k >= 1 && cur.used + sumH(unit.slice(0, k), gap) + gap > avail + 0.5) k--;
        if (k >= 1 && unit[0].k === 'item') {
          const head = unit.slice(0, k);
          cur.blocks.push(...head);
          cur.used += sumH(head, gap) + gap;
          queue.unshift(unit.slice(k));
          continue;
        }
        pages.push(cur);
        cur = { blocks: cont ? [cont] : [], used: cont ? cont.h : 0, hasBody: false };
        need = sumH(unit, gap) + (cur.blocks.length ? gap : 0);
      }
      cur.blocks.push(...unit);
      cur.used += need;
      cur.hasBody = true;
    }
    for (const b of optional) {
      const need = b.h + (cur.blocks.length ? gap : 0);
      if (cur.used + need <= avail + 0.5) { cur.blocks.push(b); cur.used += need; }
    }
    pages.push(cur);
    return pages;
  }

  async function paginateSection(ctx, fmt, section, hooks = {}) {
    const tpl = ctx.tpl;
    ctx.section = section.key;
    let parts;
    if (section.kind === 'day') parts = tpl.day(ctx, section.day);
    else parts = tpl.overview(ctx);
    const strip = state_isPng(fmt) ? creditStrip(ctx, section) : '';
    const blocks = [{ k: 'head', html: parts.head }];
    if (parts.map) blocks.push({ k: 'map', html: parts.map });
    parts.items.forEach((html) => blocks.push({ k: 'item', html }));
    if (parts.foot) blocks.push({ k: parts.footOptional ? 'opt' : 'tail', html: parts.foot });
    if (strip) blocks.push({ k: 'strip', html: strip });
    if (parts.cont) blocks.push({ k: 'cont', html: parts.cont });

    const densities = fmt.dense ? [0, 1] : [0];
    let result = null;
    for (const d of densities) {
      const L = tpl.layout(d);
      const heights = await measure(ctx, fmt, d, blocks);
      blocks.forEach((b, i) => { b.h = heights[i]; });
      const stripBlock = blocks.find((b) => b.k === 'strip');
      const stripH = stripBlock ? Math.ceil(stripBlock.h) + 14 : 0; // créditos das fotos: área reservada no rodapé
      const L2 = { ...L, pb: L.pb + stripH, strip: stripH };
      const avail = (fmt.h ? fmt.h : fmt.maxH) - L2.pt - L2.pb;
      const pages = pack(blocks, avail, L.gap);
      result = { density: d, L: L2, pages, strip: stripBlock?.html || '', stripH };
      if (pages.length === 1) break; // coube numa única imagem
    }
    return result.pages.map((p) => {
      const { L, density } = result;
      const height = fmt.h ? fmt.h : Math.max(fmt.minH, Math.ceil(L.pt + p.used + L.pb));
      return { section, density, height, blocks: p.blocks.map((b) => b.html), L, strip: result.strip, stripH: result.stripH };
    });
  }
  const state_isPng = (fmt) => fmt.kind === 'png';

  function pageHtml(ctx, fmt, page, info) {
    const tpl = ctx.tpl;
    if (page.cover) {
      return `<div class="${rootClass(tpl, fmt, 0, 'cover')}" style="${rootStyle(ctx, fmt, tpl.layout(0), page.height)}">${page.cover}${page.strip ? `<div class="xp-credabs">${page.strip}</div>` : ''}</div>`;
    }
    const chrome = tpl.chrome(ctx, { n: info.n, total: info.total, sub: page.section.sub, showNum: info.showNum, kind: page.section.kind });
    return `<div class="${rootClass(tpl, fmt, page.density, page.section.kind)}" style="${rootStyle(ctx, fmt, page.L, page.height)}">
      <div class="xp-top">${chrome.top || ''}</div><div class="xp-body">${page.blocks.map(wrap).join('')}</div><div class="xp-bot">${chrome.bottom || ''}</div>${page.strip ? `<div class="xp-credabs">${page.strip}</div>` : ''}</div>`;
  }

  // Monta todas as páginas da exportação (sem renderizar em canvas).
  async function plan(state, trip, extra = {}) {
    const fmt = formatFor(state);
    const model = M.build(trip);
    const ctx = makeCtx(state, trip, model, fmt, extra);
    if (extra.collectMaps) ctx.mapKeys = new Set();
    const sections = sectionsFor(state, model);
    const pdf = state.format === 'pdf';
    const all = [];
    for (const section of sections) {
      if (section.kind === 'cover') {
        ctx.section = 'cover';
        all.push({ section, cover: ctx.tpl.cover(ctx), strip: state_isPng(fmt) ? creditStrip(ctx, section) : '', density: 0, height: fmt.h || fmt.coverH, blocks: [] });
      } else {
        all.push(...await paginateSection(ctx, fmt, section));
      }
      await new Promise((r) => setTimeout(r, 0)); // devolve o controle à interface entre seções
    }
    // numeração: PDF é contínua; PNG numera só as partes de cada seção
    const total = all.length;
    const perSection = new Map();
    all.forEach((p) => perSection.set(p.section.key, (perSection.get(p.section.key) || 0) + 1));
    const seen = new Map();
    all.forEach((p, i) => {
      const part = (seen.get(p.section.key) || 0) + 1;
      seen.set(p.section.key, part);
      const parts = perSection.get(p.section.key);
      const info = pdf ? { n: i + 1, total, showNum: !p.cover } : { n: part, total: parts, showNum: parts > 1 };
      p.html = pageHtml(ctx, fmt, p, info);
      p.part = part; p.parts = parts; p.w = fmt.w;
      p.label = `${p.section.label}${parts > 1 ? ` (${part}/${parts})` : ''}`;
    });
    return { fmt, model, ctx, sections, pages: all, mapKeys: ctx.mapKeys };
  }

  // ---------- renderização ----------
  async function renderCanvas(page, fmt, bg) {
    const h2c = await A.loadHtml2Canvas();
    const { doc } = await ensureFrame();
    const root = doc.getElementById('root');
    root.innerHTML = page.html;
    await nextFrame();
    let scale = fmt.scale;
    scale = Math.max(1, Math.min(scale, Math.sqrt(MAX_PIXELS / (fmt.w * page.height))));
    // O canvas precisa pertencer ao iframe: as fontes dos modelos só existem lá. Num canvas do documento
    // principal o navegador desenharia com fonte reserva (e o texto ficaria desalinhado).
    const canvas = doc.createElement('canvas');
    canvas.width = Math.floor(fmt.w * scale);
    canvas.height = Math.floor(page.height * scale);
    try {
      return await h2c(root.firstElementChild, {
        canvas, scale, backgroundColor: bg, logging: false, useCORS: true, allowTaint: false,
        width: fmt.w, height: page.height, windowWidth: fmt.w, windowHeight: page.height, imageTimeout: 15000,
        // o html2canvas mede o layout num clone do documento: as fontes precisam estar prontas lá também
        onclone: (clonedDoc) => A.ensureFonts(clonedDoc, 5000),
      });
    } finally { root.innerHTML = ''; }
  }
  const toBytes = async (canvas, type, quality) => {
    const blob = await new Promise((res) => canvas.toBlob(res, type, quality));
    if (!blob) throw new Error('O navegador não conseguiu gerar a imagem (memória insuficiente). Tente reduzir a seleção.');
    return new Uint8Array(await blob.arrayBuffer());
  };

  // ---------- exportação completa ----------
  async function run(state, trip, { onProgress = () => {}, signal } = {}) {
    const fmt = formatFor(state);
    onProgress(0.02, 'Preparando…');
    await ensureFrame();
    checkAbort(signal);

    // 1) imagens e mapas
    A.forgetFailed();
    const first = await plan(state, trip, { collectMaps: true });
    const urls = [];
    const addPhotoUrl = (url) => { if (url && !url.startsWith('data:')) urls.push(url); };
    if (first.model.trip.emoji.startsWith('flag:')) addPhotoUrl(flagUrl(first.model.trip.emoji.slice(5), 160));
    first.sections.forEach((s) => {
      if (s.kind === 'cover' && first.model.hero) addPhotoUrl(first.model.hero.stop.photo);
      if (state.opts.photos) {
        if (s.kind === 'overview') first.model.highlights.forEach((h) => addPhotoUrl(h.stop.photo));
        if (s.kind === 'day') s.day.stops.forEach((st) => addPhotoUrl(st.photo));
      }
    });
    await A.preload(urls, { signal, onProgress: (d, t) => onProgress(0.04 + 0.22 * (d / t), `Carregando imagens (${d}/${t})`) });
    checkAbort(signal);
    const ready = await plan(state, trip, { collectMaps: true });
    const mapKeys = [...(ready.mapKeys || [])];
    if (mapKeys.length) {
      let done = 0;
      await Promise.all(mapKeys.map(async (key) => {
        // as entradas já foram criadas pelo plan(); só aguardamos
        await new Promise((resolve) => {
          const check = () => (A.hasMapSettled(key) ? resolve() : setTimeout(check, 120));
          check();
        });
        done++;
        onProgress(0.26 + 0.14 * (done / mapKeys.length), `Montando mapas (${done}/${mapKeys.length})`);
      }));
    }
    checkAbort(signal);

    // 2) páginas (com todas as imagens prontas)
    onProgress(0.42, 'Organizando as páginas…');
    const final = await plan(state, trip);
    if (!final.pages.length) throw new Error('Nada para exportar. Selecione ao menos um dia.');

    // 3) renderização página a página
    const bg = state.colors.bg;
    const out = [];
    const inflight = [];
    for (let i = 0; i < final.pages.length; i++) {
      checkAbort(signal);
      const page = final.pages[i];
      onProgress(0.45 + 0.5 * (i / final.pages.length), `Gerando ${fmt.kind === 'pdf' ? 'página' : 'imagem'} ${i + 1} de ${final.pages.length}…`);
      const canvas = await renderCanvas(page, final.fmt, bg);
      const entry = { page, width: canvas.width, height: canvas.height, bytes: null };
      // a codificação (JPEG/PNG) roda em paralelo com o desenho da próxima página; no máximo duas em andamento
      const encoding = (fmt.kind === 'pdf' ? toBytes(canvas, 'image/jpeg', 0.92) : toBytes(canvas, 'image/png')).then((bytes) => {
        entry.bytes = bytes;
        canvas.width = canvas.height = 0; // libera memória
      });
      inflight.push(encoding);
      out.push(entry);
      if (inflight.length >= 2) await inflight.shift();
      await new Promise((r) => setTimeout(r, 0));
    }
    await Promise.all(inflight);
    checkAbort(signal);

    // 4) arquivo final
    onProgress(0.96, 'Finalizando o arquivo…');
    const base = M.slug(trip.name);
    const title = `${trip.name} — roteiro`;
    if (fmt.kind === 'pdf') {
      const blob = ExportFiles.pdf(out.map((e) => ({ jpeg: e.bytes, width: e.width, height: e.height, pw: fmt.pt[0], ph: fmt.pt[1] })), { title });
      const suffix = { trip: 'roteiro', overview: 'resumo', day: `dia-${final.sections.find((s) => s.kind === 'day')?.day.number || ''}`, days: 'dias' }[state.scope];
      return { blob, filename: `${base}-${suffix}.pdf`, count: out.length, kind: 'pdf' };
    }
    const files = out.map((e) => {
      const s = e.page.section;
      const name = s.kind === 'cover' ? 'capa' : s.kind === 'overview' ? 'resumo' : `dia-${s.day.number}`;
      return { name: `${base}-${name}${e.page.parts > 1 ? `-parte-${e.page.part}` : ''}.png`, data: e.bytes };
    });
    if (files.length === 1) return { blob: new Blob([files[0].data], { type: 'image/png' }), filename: files[0].name, count: 1, kind: 'png' };
    const tag = { trip: 'roteiro', overview: 'resumo', day: `dia-${final.sections.find((s) => s.kind === 'day')?.day.number || ''}`, days: 'dias' }[state.scope];
    return { blob: ExportFiles.zip(files), filename: `${base}-${tag}-png.zip`, count: files.length, kind: 'zip' };
  }

  return { FORMATS, formatFor, plan, run, ensureFrame, dispose, selectedDays, sectionsFor };
})();

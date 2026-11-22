// ---------- exportação: imagens, mapas, fontes e iframe isolado ----------
// Imagens vêm de outros domínios (Wikimedia, FlagCDN, OpenStreetMap). Para não "contaminar" o canvas
// (CORS), cada imagem é baixada com fetch em modo CORS e convertida em data URL. Se o servidor não
// permitir, a imagem é simplesmente omitida (nunca quebra a exportação).
const ExportAssets = (() => {
  const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800'
    + '&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Poppins:wght@500;600;700;800'
    + '&family=Caveat:wght@500;700&family=Patrick+Hand&display=swap';
  const FONT_PROBES = [
    '400 16px "Inter"', '600 16px "Inter"', '800 16px "Inter"',
    '400 16px "Playfair Display"', '700 16px "Playfair Display"', 'italic 400 16px "Playfair Display"',
    '600 16px "Poppins"', '800 16px "Poppins"',
    '500 16px "Caveat"', '700 16px "Caveat"', '400 16px "Patrick Hand"',
  ];

  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => { try { fn(); } catch { /* ignora */ } });
  const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // ---------- fila com limite de concorrência ----------
  let active = 0;
  const waiting = [];
  function limited(task, max = 4) {
    return new Promise((resolve) => {
      const run = async () => {
        active++;
        try { resolve(await task()); } catch { resolve(null); } finally {
          active--;
          const next = waiting.shift();
          if (next) next();
        }
      };
      if (active < max) run(); else waiting.push(run);
    });
  }
  function withTimeout(ms, fn) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fn(controller.signal).finally(() => clearTimeout(timer));
  }
  const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  // ---------- fotos ----------
  const photos = new Map(); // url -> { state: 'loading' | 'ready' | 'failed', data }
  function startPhoto(url) {
    const entry = { state: 'loading', data: '', promise: null };
    photos.set(url, entry);
    entry.promise = limited(() => withTimeout(12000, async (signal) => {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!/^image\//.test(blob.type)) throw new Error('não é imagem');
      return readAsDataUrl(blob);
    })).then((data) => {
      entry.state = data ? 'ready' : 'failed';
      entry.data = data || '';
      notify();
      return entry;
    });
    return entry;
  }
  function photo(url) {
    if (!url) return { state: 'failed', data: '' };
    return photos.get(url) || startPhoto(url);
  }
  async function preload(urls, { onProgress, signal } = {}) {
    const unique = [...new Set(urls.filter(Boolean))];
    let done = 0;
    await Promise.all(unique.map(async (url) => {
      await photo(url).promise;
      done++;
      if (signal?.aborted) return;
      onProgress?.(done, unique.length);
    }));
  }
  // permite nova tentativa em uma próxima exportação para o que falhou
  function forgetFailed() {
    for (const [url, entry] of photos) if (entry.state === 'failed') photos.delete(url);
  }

  // ---------- mapas ----------
  const tileCache = new Map();
  const maps = new Map(); // key -> { state, data, promise }
  const TILE = 256;

  function project(lat, lon, z) {
    const n = TILE * 2 ** z;
    const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
    return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
  }
  function loadTile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (tileCache.has(key)) return tileCache.get(key);
    const p = limited(() => withTimeout(9000, async (signal) => {
      const res = await fetch(`https://tile.openstreetmap.org/${key}.png`, { mode: 'cors', credentials: 'omit', signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bmp = await createImageBitmap(await res.blob());
      return bmp;
    }), 6);
    tileCache.set(key, p);
    return p;
  }

  // groups: [{ color, stops: [{lat, lon, n}], legs: [[lat,lon]...] por trecho (índice = parada de chegada) }]
  async function drawMap({ groups, width, height, scale = 2, padding = 46 }) {
    const pts = [];
    groups.forEach((g) => {
      g.stops.forEach((s) => pts.push([s.lat, s.lon]));
      (g.legs || []).forEach((leg) => (leg || []).forEach((p) => pts.push(p)));
    });
    const valid = pts.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    if (!valid.length) return '';
    const pad = padding;
    const lats = valid.map((p) => p[0]), lons = valid.map((p) => p[1]);
    const bounds = { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
    let z = valid.length === 1 || (bounds.minLat === bounds.maxLat && bounds.minLon === bounds.maxLon) ? 15 : 17;
    if (z !== 15 || valid.length > 1) {
      for (; z > 2; z--) {
        const [x1, y1] = project(bounds.maxLat, bounds.minLon, z);
        const [x2, y2] = project(bounds.minLat, bounds.maxLon, z);
        if (Math.abs(x2 - x1) <= width - pad * 2 && Math.abs(y2 - y1) <= height - pad * 2) break;
      }
    }
    const [cx1, cy1] = project(bounds.maxLat, bounds.minLon, z);
    const [cx2, cy2] = project(bounds.minLat, bounds.maxLon, z);
    const cx = (cx1 + cx2) / 2, cy = (cy1 + cy2) / 2;
    const ox = cx - width / 2, oy = cy - height / 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#e8edf0';
    ctx.fillRect(0, 0, width, height);

    // tiles (no máximo ~30 requisições por mapa)
    const max = 2 ** z;
    const tx0 = Math.floor(ox / TILE), tx1 = Math.floor((ox + width) / TILE);
    const ty0 = Math.max(0, Math.floor(oy / TILE)), ty1 = Math.min(max - 1, Math.floor((oy + height) / TILE));
    const jobs = [];
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) jobs.push([tx, ty]);
    let drawn = 0;
    if (jobs.length <= 40) {
      await Promise.all(jobs.map(async ([tx, ty]) => {
        const bmp = await loadTile(z, ((tx % max) + max) % max, ty);
        if (!bmp) return;
        ctx.drawImage(bmp, tx * TILE - ox, ty * TILE - oy, TILE, TILE);
        drawn++;
      }));
    }
    if (!drawn) { // sem tiles (offline): grade discreta para o mapa não ficar "vazio"
      ctx.strokeStyle = 'rgba(31,58,95,.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = 0; y < height; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(0, 0, width, height); // suaviza o fundo para destacar o percurso

    const px = (lat, lon) => { const [x, y] = project(lat, lon, z); return [x - ox, y - oy]; };
    const line = (geo, color, w, dash) => {
      ctx.beginPath();
      geo.forEach(([la, lo], i) => { const [x, y] = px(la, lo); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.setLineDash(dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    groups.forEach((g) => {
      g.stops.forEach((s, i) => {
        if (i === 0) return;
        const geo = g.legs?.[i] && g.legs[i].length > 1 ? g.legs[i] : [[g.stops[i - 1].lat, g.stops[i - 1].lon], [s.lat, s.lon]];
        const dashed = !(g.legs?.[i] && g.legs[i].length > 1);
        line(geo, 'rgba(255,255,255,.95)', 8);
        line(geo, g.color, 4.5, dashed ? [7, 7] : null);
      });
    });
    const r = groups.reduce((n, g) => n + g.stops.length, 0) > 25 ? 8 : 11;
    groups.forEach((g) => g.stops.forEach((s) => {
      const [x, y] = px(s.lat, s.lon);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = g.color; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (r >= 11) {
        ctx.fillStyle = '#fff'; ctx.font = '700 11px Inter, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(s.n), x, y + 0.5);
      }
    }));
    // atribuição exigida pela licença do OpenStreetMap
    const label = '© OpenStreetMap';
    ctx.font = '600 10px Inter, Arial, sans-serif';
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(width - w, height - 17, w, 17);
    ctx.fillStyle = '#44525f'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, width - w + 6, height - 8.5);
    return canvas.toDataURL('image/jpeg', 0.9);
  }
  function map(key, spec) {
    let entry = maps.get(key);
    if (!entry) {
      entry = { state: 'loading', data: '', promise: null };
      maps.set(key, entry);
      entry.promise = drawMap(spec).then((data) => { entry.state = data ? 'ready' : 'failed'; entry.data = data; notify(); return entry; })
        .catch(() => { entry.state = 'failed'; notify(); return entry; });
    }
    return entry;
  }

  // ---------- iframe isolado ----------
  // Os modelos são renderizados dentro de um iframe próprio: o CSS do aplicativo não interfere
  // (e vice-versa) e o html2canvas precisa clonar apenas um documento pequeno.
  function createFrame({ visible = false } = {}) {
    return new Promise((resolve) => {
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', visible ? 'false' : 'true');
      frame.title = visible ? 'Pré-visualização da exportação' : 'Área de montagem da exportação';
      if (!visible) frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1400px;height:1400px;border:0;pointer-events:none;';
      const css = new URL('css/export-templates.css', document.baseURI).href;
      frame.srcdoc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
        <link rel="stylesheet" href="${FONT_CSS}">
        <link rel="stylesheet" href="${css}">
        <style>html,body{margin:0;padding:0;background:transparent}</style></head><body><div id="root"></div></body></html>`;
      frame.addEventListener('load', () => resolve({ frame, doc: frame.contentDocument }), { once: true });
      (visible ? document.querySelector('#exPreviewHost') : document.body).appendChild(frame);
    });
  }
  async function ensureFonts(doc, timeout = 6000) {
    const task = Promise.all(FONT_PROBES.map((f) => doc.fonts.load(f).catch(() => null))).then(() => doc.fonts.ready);
    await Promise.race([task, new Promise((r) => setTimeout(r, timeout))]);
  }

  // ---------- html2canvas (carregado sob demanda, com verificação de integridade) ----------
  const H2C_SOURCES = [
    { url: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
      integrity: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H' },
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      integrity: 'sha512-BNaRQnYJYiPSqHHDb58B0yaPfCu+Wgds8Gp/gU33kqBtgNS4tSPHuGibyoeqMV/TJlSKda6FXzoEyYGjTe+vXA==' },
  ];
  let h2cPromise = null;
  function loadScript({ url, integrity }) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.integrity = integrity; s.crossOrigin = 'anonymous';
      s.onload = () => (window.html2canvas ? resolve(window.html2canvas) : reject(new Error('indisponível')));
      s.onerror = () => { s.remove(); reject(new Error('falha ao carregar')); };
      document.head.appendChild(s);
    });
  }
  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (!h2cPromise) {
      h2cPromise = (async () => {
        for (const source of H2C_SOURCES) {
          try { return await loadScript(source); } catch { /* tenta a próxima origem */ }
        }
        throw new Error(navigator.onLine ? 'Não foi possível carregar o gerador de imagens. Verifique a conexão e tente novamente.' : 'Sem internet: o gerador de imagens ainda não foi baixado neste aparelho. Conecte-se uma vez para exportar PDF e PNG offline.');
      })().catch((err) => { h2cPromise = null; throw err; });
    }
    return h2cPromise;
  }

  const hasMapSettled = (key) => { const e = maps.get(key); return !e || e.state !== 'loading'; };
  return { photo, preload, forgetFailed, map, hasMapSettled, onChange, createFrame, ensureFonts, loadHtml2Canvas };
})();

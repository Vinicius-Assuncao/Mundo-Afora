// ---------- APIs ----------
async function ors(mode, a, b) {
  if (!hasKey()) throw new Error('Configure a chave em config.js para calcular trajetos.');
  if (!navigator.onLine) throw new Error('Sem internet: o trajeto será calculado quando você estiver online.');
  const r = await fetch(`https://api.heigit.org/openrouteservice/v2/directions/${MODES[mode].profile}/geojson`, {
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

async function reversePlace(lat, lon) {
  if (!navigator.onLine) throw new Error('Sem internet: o reconhecimento do local precisa de conexão.');
  const params = new URLSearchParams({
    format: 'jsonv2', lat: String(lat), lon: String(lon), zoom: '18',
    addressdetails: '1', namedetails: '1', extratags: '1', 'accept-language': 'pt-BR',
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
  if (!response.ok) throw new Error(`O reconhecimento do local falhou (HTTP ${response.status}).`);
  const result = await response.json();
  if (result.error) throw new Error('O Nominatim não encontrou um endereço próximo. Você pode informar um nome manualmente.');
  const tags = result.extratags || {};
  const named = result.namedetails || {};
  const recognizedName = named.name || named['name:pt'] || result.name
    || tags['official_name'] || tags['name'];
  const category = `${result.category || result.class || ''}/${result.type || ''}`.toLowerCase();
  const tourist = /tourism|historic|attraction|museum|monument|artwork|castle|church|memorial|viewpoint|archaeological_site|heritage/.test(category)
    || !!(tags.wikidata || tags.wikipedia);
  return {
    name: recognizedName || '',
    wikiName: recognizedName || '',
    lat: Number(lat), lon: Number(lon), address: result.display_name || '',
    osmType: result.type || '', osmCategory: result.category || result.class || '',
    wikidataId: tags.wikidata || '', wikipedia: tags.wikipedia || '',
    recognized: !!recognizedName, tourist,
  };
}

async function searchPlaces(q) {
  if (!navigator.onLine) throw new Error('Sem internet: a busca de lugares só funciona online.');
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=pt-BR&extratags=1&namedetails=1&q=' + encodeURIComponent(q));
  if (!r.ok) throw new Error('Busca indisponível no momento.');
  return (await r.json()).map((p) => ({
    name: p.name || p.display_name.split(',')[0], lat: +p.lat, lon: +p.lon, address: p.display_name,
    wikiName: p.name || p.namedetails?.name || '', wikidataId: p.extratags?.wikidata || '', wikipedia: p.extratags?.wikipedia || '',
  }));
}

// ---------- Wikimedia: fila global, cache e retentativas ----------
const WIKI_CACHE_KEY = 'mundo-afora.wikimedia-cache.v3';
const WIKI_CACHE_TTL = 1000 * 60 * 60 * 24 * 30;
const WIKI_NEGATIVE_TTL = 1000 * 60 * 60 * 8;
const WIKI_MIN_INTERVAL = 450;
let wikiQueue = Promise.resolve();
let wikiLastRequest = 0;
let wikiRenderTimer = null;

function readWikiCache() {
  try { return JSON.parse(localStorage.getItem(WIKI_CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function writeWikiCache(key, value, negative = false) {
  const cache = readWikiCache();
  cache[key] = { value, expires: Date.now() + (negative ? WIKI_NEGATIVE_TTL : WIKI_CACHE_TTL) };
  const entries = Object.entries(cache)
    .filter(([, item]) => item && item.expires > Date.now())
    .slice(-180);
  try { localStorage.setItem(WIKI_CACHE_KEY, JSON.stringify(Object.fromEntries(entries))); }
  catch { /* armazenamento indisponível/cheio: a consulta continua normalmente */ }
}
function hasWikiCache(key) {
  const item = readWikiCache()[key];
  return !!item && item.expires > Date.now();
}
function getWikiCache(key) {
  const item = readWikiCache()[key];
  if (!item || item.expires <= Date.now()) return null;
  return item.value;
}
function retryDelay(response, attempt) {
  const header = response?.headers?.get('Retry-After');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.min(30000, Math.max(1000, seconds * 1000));
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.min(30000, Math.max(1000, date - Date.now()));
  }
  return Math.min(30000, 1200 * (2 ** attempt)) + Math.random() * 450;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function wikimediaFetch(url, options = {}) {
  const task = async () => {
    const cached = options.cacheKey ? getWikiCache(options.cacheKey) : null;
    if (cached !== null) return cached;

    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = Math.max(0, WIKI_MIN_INTERVAL - (Date.now() - wikiLastRequest));
      if (wait) await sleep(wait);
      wikiLastRequest = Date.now();

      let response;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 9000);
        try {
          response = await fetch(url, { ...options.fetchOptions, signal: controller.signal, headers: {
          'Accept': 'application/json',
          ...(options.fetchOptions?.headers || {}),
          } });
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        if (attempt === 2) throw error;
        await sleep(Math.min(12000, 900 * (2 ** attempt)) + Math.random() * 350);
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt === 2) {
          const error = new Error(`Wikimedia temporariamente indisponível (HTTP ${response.status}).`);
          error.status = response.status;
          throw error;
        }
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!response.ok) {
        const error = new Error(`Falha na consulta Wikimedia (HTTP ${response.status}).`);
        error.status = response.status;
        throw error;
      }
      const data = await response.json();
      if (options.cacheKey) writeWikiCache(options.cacheKey, data, false);
      return data;
    }
    throw new Error('Não foi possível consultar a Wikimedia.');
  };

  // Uma única fila para todas as APIs Wikimedia/Wikipedia evita rajadas paralelas.
  const result = wikiQueue.then(task, task);
  wikiQueue = result.catch(() => {});
  return result;
}

function normalizeWikiText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function haversineKm(aLat, aLon, bLat, bLon) {
  const rad = (v) => v * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
const NOT_PHOTO_RE = /\b(map|mapa|carte|karte|locator|localiz|roteiro|route|itiner|logo|escudo|brasao|coat|flag|bandeira|symbol|icon|diagram)\b/i;
function isPhotoUrl(url) {
  return !!url && !NOT_PHOTO_RE.test(url) && !/\.svg(\?|$)/i.test(url);
}
function commonsApi(params) {
  return 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    format: 'json', origin: '*', ...params,
  }).toString();
}
function cleanExt(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
function attributionFromImageInfo(info) {
  const ext = info.extmetadata || {};
  const artist = cleanExt(ext.Artist?.value || ext.Credit?.value || '');
  const license = cleanExt(ext.LicenseShortName?.value || ext.UsageTerms?.value || '');
  const description = cleanExt(ext.ImageDescription?.value || '');
  const source = info.descriptionurl || info.url || '';
  const author = artist || 'Autor não informado';
  const compact = [author, license].filter(Boolean).join(' · ');
  return {
    author, license, description: description.slice(0, 500),
    source, credit: compact.slice(0, 150),
    licenseUrl: ext.LicenseUrl?.value || '',
  };
}
function validCommonsImage(info) {
  return !!info
    && /^image\/(jpeg|png|webp)$/.test(info.mime || '')
    && Number(info.width) >= 500
    && Number(info.height) >= 250
    && isPhotoUrl(info.thumburl || info.url);
}
async function commonsImageByTitle(title) {
  const data = await wikimediaFetch(commonsApi({
    action: 'query', prop: 'imageinfo', titles: title,
    iiprop: 'url|mime|size|extmetadata', iiurlwidth: '900',
  }));
  const page = Object.values(data.query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  return validCommonsImage(info) ? { info, title: page.title } : null;
}

// ---------- Identificação e fotos: QID > tag wikipedia > nome similar > geografia > Commons ----------
// Limites de segurança: tudo que é achado por aproximação precisa estar perto do ponto.
const NAME_STOP_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'the', 'del', 'della', 'di', 'la', 'le', 'los', 'las', 'and', 'von', 'van']);
const NAME_MATCH_MIN = 0.6;          // similaridade mínima ao procurar entidade por nome
const ENTITY_MAX_KM = 1.5;           // entidade achada por nome precisa estar a no máximo isto do ponto
const WIKIPEDIA_GEO_RADIUS_M = 300;  // raio da busca geográfica da Wikipédia
const COMMONS_GEO_RADIUS_M = 150;    // raio da busca geográfica de fotos no Commons
const COMMONS_TEXT_MAX_KM = 0.3;     // foto achada por texto no Commons precisa ter coordenada até aqui
const FILE_NEAR_KM = 0.5;            // foto de categoria com coordenada precisa estar até aqui

function nameTokens(value) {
  return normalizeWikiText(value).split(' ').filter((t) => t.length > 2 && !NAME_STOP_WORDS.has(t));
}
// 0..1: mistura de "um nome contém o outro" com sobreposição geral de palavras.
function nameSimilarity(a, b) {
  const A = new Set(nameTokens(a)), B = new Set(nameTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => { if (B.has(t)) inter += 1; });
  const union = new Set([...A, ...B]).size;
  return 0.5 * (inter / Math.min(A.size, B.size)) + 0.5 * (inter / union);
}
function entityCoords(entity) {
  const p = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  return p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) ? { lat: p.latitude, lon: p.longitude } : null;
}
function entityLabels(entity) {
  return ['pt', 'en', 'it'].flatMap((l) => [entity.labels?.[l]?.value, ...(entity.aliases?.[l] || []).map((i) => i.value)]).filter(Boolean);
}
function hasPoint(stop) { return Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lon)); }

async function wikidataEntities(params) {
  const data = await wikimediaFetch('https://www.wikidata.org/w/api.php?' + new URLSearchParams({
    action: 'wbgetentities', props: 'labels|aliases|claims|sitelinks', languages: 'pt|en|it',
    format: 'json', origin: '*', ...params,
  }));
  return Object.values(data.entities || {}).filter((e) => e && /^Q\d+$/.test(e.id || ''));
}
async function entityByName(name, lat, lon) {
  const found = new Map();
  for (const language of ['pt', 'en', 'it']) {
    const result = await wikimediaFetch('https://www.wikidata.org/w/api.php?' + new URLSearchParams({
      action: 'wbsearchentities', search: name, language, uselang: language, type: 'item', limit: '8', format: 'json', origin: '*',
    }));
    (result.search || []).forEach((item) => found.set(item.id, item));
    if ([...found.values()].some((i) => normalizeWikiText(i.label) === normalizeWikiText(name))) break;
  }
  if (!found.size) return null;
  const entities = await wikidataEntities({ ids: [...found.keys()].slice(0, 30).join('|') });
  const withPoint = Number.isFinite(lat) && Number.isFinite(lon);
  const ranked = entities.map((entity) => {
    const score = Math.max(0, ...entityLabels(entity).map((l) => nameSimilarity(name, l)));
    const c = entityCoords(entity);
    const distance = withPoint && c ? haversineKm(lat, lon, c.lat, c.lon) : null;
    return { entity, score, distance };
  }).filter((i) => i.score >= NAME_MATCH_MIN
    // Sem coordenadas para conferir, só aceita nome praticamente idêntico.
    && (i.distance === null ? i.score >= 0.99 : i.distance <= ENTITY_MAX_KM))
    .sort((a, b) => (b.score - a.score) || ((a.distance ?? 9999) - (b.distance ?? 9999)));
  return ranked[0]?.entity || null;
}
// Fallback geográfico: páginas da Wikipédia num raio curto, filtradas por nome parecido.
async function entityByGeo(name, lat, lon) {
  for (const language of ['pt', 'en']) {
    const data = await wikimediaFetch(`https://${language}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query', generator: 'geosearch', ggscoord: `${lat}|${lon}`, ggsradius: String(WIKIPEDIA_GEO_RADIUS_M),
      ggslimit: '10', prop: 'pageprops', ppprop: 'wikibase_item', format: 'json', origin: '*',
    }));
    const pages = Object.values(data.query?.pages || {}).filter((p) => p.pageprops?.wikibase_item)
      .map((p) => ({ qid: p.pageprops.wikibase_item, score: nameSimilarity(name, p.title) }))
      .filter((p) => p.score >= 0.5).sort((a, b) => b.score - a.score);
    if (pages[0]) {
      const [entity] = await wikidataEntities({ ids: pages[0].qid });
      if (entity) return entity;
    }
  }
  return null;
}
async function findWikidataEntity(stop) {
  const name = stop.wikiName || '';   // nome personalizado (stop.name) é só visual e nunca entra aqui
  const lat = Number(stop.lat), lon = Number(stop.lon);
  const cacheKey = `entity3:${stop.wikidataId || ''}:${stop.wikipedia || ''}:${normalizeWikiText(name)}:${hasPoint(stop) ? lat.toFixed(3) + ':' + lon.toFixed(3) : ''}`;
  if (hasWikiCache(cacheKey)) return getWikiCache(cacheKey);
  let entity = null;
  if (/^Q\d+$/.test(stop.wikidataId || '')) entity = (await wikidataEntities({ ids: stop.wikidataId }))[0] || null;
  if (!entity && stop.wikipedia) {
    const m = /^([a-z-]+):(.+)$/i.exec(stop.wikipedia);
    if (m) entity = (await wikidataEntities({ sites: m[1].toLowerCase() + 'wiki', titles: m[2] }))[0] || null;
  }
  if (!entity && name) entity = await entityByName(name, lat, lon);
  if (!entity && name && hasPoint(stop)) entity = await entityByGeo(name, lat, lon);
  writeWikiCache(cacheKey, entity, !entity);
  return entity;
}

// ---------- Fotos ----------
const IMG_PARAMS = { prop: 'imageinfo|coordinates', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '900', colimit: 'max' };
function fileCoords(page, info) {
  const c = page.coordinates?.[0];
  if (c) return { lat: c.lat, lon: c.lon };
  const ext = info?.extmetadata || {};
  const la = Number(ext.GPSLatitude?.value), lo = Number(ext.GPSLongitude?.value);
  return Number.isFinite(la) && Number.isFinite(lo) ? { lat: la, lon: lo } : null;
}
function fileText(page, info) {
  return `${page.title || ''} ${cleanExt(info?.extmetadata?.ImageDescription?.value || '')}`;
}
function commonsCandidates(data) {
  return Object.values(data.query?.pages || {}).map((page) => ({ page, info: page.imageinfo?.[0] }))
    .filter(({ info }) => validCommonsImage(info));
}
async function imageFromP18(entity) {
  const file = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file) return null;
  return commonsImageByTitle('File:' + file);
}
async function imageByDepicts(entity) {
  if (!entity?.id) return null;
  // A imagem precisa declarar depicts (P180) para esta entidade.
  const data = await wikimediaFetch(commonsApi({
    action: 'query', generator: 'search', gsrsearch: `haswbstatement:P180=${entity.id}`,
    gsrnamespace: '6', gsrlimit: '18', ...IMG_PARAMS,
  }));
  const first = commonsCandidates(data)[0];
  return first ? { info: first.info, title: first.page.title } : null;
}
// Categoria do item (P373): só aceita arquivo perto do ponto ou com nome parecido.
async function imageFromCategory(entity, stop) {
  const category = entity?.claims?.P373?.[0]?.mainsnak?.datavalue?.value;
  if (!category) return null;
  const data = await wikimediaFetch(commonsApi({
    action: 'query', generator: 'categorymembers', gcmtitle: 'Category:' + category,
    gcmtype: 'file', gcmlimit: '18', ...IMG_PARAMS,
  }));
  for (const { page, info } of commonsCandidates(data)) {
    if (!stop.wikiName) return { info, title: page.title };   // identificado só por ID: confia na categoria
    const c = fileCoords(page, info);
    if (c && hasPoint(stop)) {
      if (haversineKm(stop.lat, stop.lon, c.lat, c.lon) <= FILE_NEAR_KM) return { info, title: page.title };
    } else if (nameSimilarity(stop.wikiName, fileText(page, info)) >= 0.5) {
      return { info, title: page.title };
    }
  }
  return null;
}
// Fallback Commons 1: fotos geolocalizadas num raio curto cujo título/descrição lembra o nome.
async function commonsGeoPhoto(stop) {
  const data = await wikimediaFetch(commonsApi({
    action: 'query', generator: 'geosearch', ggscoord: `${stop.lat}|${stop.lon}`,
    ggsradius: String(COMMONS_GEO_RADIUS_M), ggslimit: '30', ggsnamespace: '6', ...IMG_PARAMS,
  }));
  const best = commonsCandidates(data)
    .map((x) => ({ ...x, score: nameSimilarity(stop.wikiName, fileText(x.page, x.info)) }))
    .filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score)[0];
  return best ? { info: best.info, title: best.page.title } : null;
}
// Fallback Commons 2: busca por texto, mas só aceita foto COM coordenada perto do ponto.
async function commonsTextPhoto(stop) {
  const data = await wikimediaFetch(commonsApi({
    action: 'query', generator: 'search', gsrsearch: stop.wikiName, gsrnamespace: '6', gsrlimit: '20', ...IMG_PARAMS,
  }));
  const best = commonsCandidates(data).map((x) => {
    const c = fileCoords(x.page, x.info);
    const km = c ? haversineKm(stop.lat, stop.lon, c.lat, c.lon) : null;
    return { ...x, km, score: nameSimilarity(stop.wikiName, fileText(x.page, x.info)) };
  }).filter((x) => x.km !== null && x.km <= COMMONS_TEXT_MAX_KM && x.score >= 0.34)
    .sort((a, b) => (b.score - a.score) || (a.km - b.km))[0];
  return best ? { info: best.info, title: best.page.title } : null;
}
async function stopPhoto(entity, stop) {
  const cacheKey = `photo3:${entity?.id || ''}:${normalizeWikiText(stop.wikiName || '')}:${hasPoint(stop) ? Number(stop.lat).toFixed(3) + ':' + Number(stop.lon).toFixed(3) : ''}`;
  if (hasWikiCache(cacheKey)) return getWikiCache(cacheKey);
  let result = null;
  if (entity) result = (await imageFromP18(entity)) || (await imageByDepicts(entity)) || (await imageFromCategory(entity, stop));
  if (!result && stop.wikiName && hasPoint(stop)) result = (await commonsGeoPhoto(stop)) || (await commonsTextPhoto(stop));
  if (!result) {
    writeWikiCache(cacheKey, null, true);
    return null;
  }
  const photo = { url: result.info.thumburl || result.info.url, title: result.title, ...attributionFromImageInfo(result.info) };
  writeWikiCache(cacheKey, photo);
  return photo;
}

// ---------- Wikipédia: resumo ligado ao item do Wikidata ----------
async function wikipediaSummary(entity) {
  if (!entity) return { desc: '', url: '' };
  const title = entity.sitelinks?.ptwiki?.title || entity.sitelinks?.enwiki?.title;
  const language = entity.sitelinks?.ptwiki ? 'pt' : 'en';
  if (!title) return { desc: '', url: '' };
  const key = `summary:${language}:${title}`;
  const cached = getWikiCache(key);
  if (cached !== null) return cached;
  const url = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const data = await wikimediaFetch(url, { cacheKey: key });
    const result = {
      desc: String(data.extract || '').slice(0, 600),
      url: data.content_urls?.desktop?.page || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    };
    writeWikiCache(key, result);
    return result;
  } catch (error) {
    // 429/5xx não viram resultado negativo; a próxima tentativa poderá recuperar.
    if (error.status !== 429 && error.status < 500) writeWikiCache(key, { desc: '', url: '' }, true);
    return { desc: '', url: '' };
  }
}

async function wikiInfo(nameOrStop) {
  const stop = typeof nameOrStop === 'string' ? { name: nameOrStop } : nameOrStop;
  const out = { desc: '', photo: '', url: '', photoCredit: '', photoAttribution: null, wikidataId: '' };
  try {
    const entity = await findWikidataEntity(stop);
    out.wikidataId = entity?.id || '';
    const [summary, photo] = await Promise.all([
      wikipediaSummary(entity),
      stopPhoto(entity, stop),
    ]);
    out.desc = summary.desc;
    out.url = summary.url;
    if (photo) {
      out.photo = photo.url;
      out.photoCredit = photo.credit;
      out.photoAttribution = photo;
    }
  } catch (error) {
    console.warn('[Mundo Afora] Enriquecimento Wikimedia adiado:', error);
  }
  return out;
}

async function enrich(stop) {
  if (!stop || wikiBusy.has(stop.id)) return;
  wikiBusy.add(stop.id);
  try {
    const w = await wikiInfo(stop);
    if (w) {
      if (w.desc) stop.desc = w.desc;
      if (w.url) stop.url = w.url;
      if (!stop.icon && w.photo) stop.photo = w.photo;
      if (w.wikidataId) stop.wikidataId = w.wikidataId;
      if (w.photoCredit) stop.photoCredit = w.photoCredit;
      if (w.photoAttribution) stop.photoAttribution = w.photoAttribution;
    }
    // Cada parada é consultada uma vez por lote. Isso evita que uma falha ou
    // ausência de dados recomece indefinidamente a pesquisa em cada render.
    stop.wikiDone = true;
  } finally {
    wikiBusy.delete(stop.id);
  }
}

function ensureWiki(trip) {
  if (!navigator.onLine) return; // fotos e descrições novas dependem de internet; retoma ao reconectar
  const pending = trip.days.flatMap((day) => day.stops)
    .filter((stop) => !stop.wikiDone && !wikiBusy.has(stop.id));
  if (!pending.length) return;
  // Processa em lotes pequenos para não saturar a rede nem bloquear a interface.
  Promise.all(pending.slice(0, 3).map(enrich)).then(() => {
    if (cur()?.id !== trip.id) return;
    save();
    if (wikiRenderTimer) clearTimeout(wikiRenderTimer);
    wikiRenderTimer = setTimeout(() => {
      wikiRenderTimer = null;
      renderTrip();
    }, 250);
    ensureWiki(trip);
  });
}

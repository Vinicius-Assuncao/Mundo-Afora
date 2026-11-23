// ---------- APIs ----------
async function ors(mode, a, b) {
  if (!hasKey()) throw new Error('Configure a chave em config.js para calcular trajetos.');
  if (!navigator.onLine) throw new Error('Sem internet: o trajeto será calculado quando você estiver online.');
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
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=pt-BR&q=' + encodeURIComponent(q));
  if (!r.ok) throw new Error('Busca indisponível no momento.');
  return (await r.json()).map((p) => ({
    name: p.name || p.display_name.split(',')[0], lat: +p.lat, lon: +p.lon, address: p.display_name,
  }));
}

// ---------- Wikimedia: fila global, cache e retentativas ----------
const WIKI_CACHE_KEY = 'mundo-afora.wikimedia-cache.v2';
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

// ---------- Wikidata: identificação por nome e localização ----------
async function findWikidataEntity(stop) {
  const name = typeof stop === 'string' ? stop : (stop.wikiName || stop.name);
  const lat = typeof stop === 'object' ? Number(stop.lat) : NaN;
  const lon = typeof stop === 'object' ? Number(stop.lon) : NaN;
  const cacheKey = `entity:${normalizeWikiText(name)}:${Number.isFinite(lat) ? lat.toFixed(3) : ''}:${Number.isFinite(lon) ? lon.toFixed(3) : ''}`;
  if (hasWikiCache(cacheKey)) return getWikiCache(cacheKey);

  const target = normalizeWikiText(name);
  const searchResults = [];
  for (const language of ['pt', 'en', 'it']) {
    const searchUrl = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
      action: 'wbsearchentities', search: name, language, uselang: language,
      type: 'item', limit: '8', format: 'json', origin: '*',
    });
    const result = await wikimediaFetch(searchUrl);
    const found = result.search || [];
    searchResults.push(...found);
    const hasExactMatch = found.some((item) =>
      normalizeWikiText(item.label) === target
      || normalizeWikiText(item.match?.text) === target
    );
    if (hasExactMatch) break;
  }
  const unique = new Map();
  searchResults.flat().forEach((item) => unique.set(item.id, item));
  const candidates = [...unique.values()].filter((item) =>
    normalizeWikiText(item.label) === target
    || normalizeWikiText(item.match?.text) === target
  );
  if (!candidates.length) {
    writeWikiCache(cacheKey, null, true);
    return null;
  }

  const ids = candidates.map((item) => item.id).join('|');
  const entitiesUrl = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
    action: 'wbgetentities', ids, props: 'labels|aliases|claims|sitelinks', languages: 'pt|en|it',
    format: 'json', origin: '*',
  });
  const data = await wikimediaFetch(entitiesUrl);
  const ranked = Object.values(data.entities || {}).map((entity) => {
    const point = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    const entityLat = point?.latitude, entityLon = point?.longitude;
    const distance = Number.isFinite(lat) && Number.isFinite(lon)
      && Number.isFinite(entityLat) && Number.isFinite(entityLon)
      ? haversineKm(lat, lon, entityLat, entityLon) : null;
    const labels = [
      entity.labels?.pt?.value, entity.labels?.en?.value, entity.labels?.it?.value,
      ...(entity.aliases?.pt || []).map((item) => item.value),
      ...(entity.aliases?.en || []).map((item) => item.value),
      ...(entity.aliases?.it || []).map((item) => item.value),
    ].filter(Boolean);
    const exact = labels.some((label) => normalizeWikiText(label) === normalizeWikiText(name));
    return { entity, distance, exact };
  }).filter((item) => {
    if (!item.exact) return false;
    // Se ambos os lados têm coordenadas, rejeita homônimos distantes.
    if (item.distance !== null && item.distance > 40) return false;
    return true;
  }).sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));

  const selected = ranked[0]?.entity || null;
  writeWikiCache(cacheKey, selected, !selected);
  return selected;
}

// ---------- Imagens: P18, P373 e busca estruturada por P180 ----------
async function imageFromP18(entity) {
  const file = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file) return null;
  return commonsImageByTitle('File:' + file);
}
async function imageFromCategory(entity) {
  const category = entity?.claims?.P373?.[0]?.mainsnak?.datavalue?.value;
  if (!category) return null;
  const data = await wikimediaFetch(commonsApi({
    action: 'query', generator: 'categorymembers', gcmtitle: 'Category:' + category,
    gcmtype: 'file', gcmlimit: '18', prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata', iiurlwidth: '900',
  }));
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (validCommonsImage(info)) return { info, title: page.title };
  }
  return null;
}
async function imageByDepicts(entity) {
  const qid = entity?.id;
  if (!qid) return null;
  // Pesquisa estruturada no Commons: a imagem precisa declarar depicts (P180) para esta entidade.
  const data = await wikimediaFetch(commonsApi({
    action: 'query', generator: 'search', gsrsearch: `haswbstatement:P180=${qid}`,
    gsrnamespace: '6', gsrlimit: '18', prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata', iiurlwidth: '900',
  }));
  const pages = Object.values(data.query?.pages || {});
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (validCommonsImage(info)) return { info, title: page.title };
  }
  return null;
}
async function wikidataPhoto(entity) {
  if (!entity) return null;
  const key = `photo:${entity.id}`;
  if (hasWikiCache(key)) return getWikiCache(key);
  let result = await imageFromP18(entity);
  if (!result) result = await imageFromCategory(entity);
  if (!result) result = await imageByDepicts(entity);
  if (!result) {
    writeWikiCache(key, null, true);
    return null;
  }
  const attribution = attributionFromImageInfo(result.info);
  const photo = {
    url: result.info.thumburl || result.info.url,
    title: result.title,
    ...attribution,
  };
  writeWikiCache(key, photo);
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
    if (!entity) return out;
    out.wikidataId = entity.id || '';
    const [summary, photo] = await Promise.all([
      wikipediaSummary(entity),
      wikidataPhoto(entity),
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

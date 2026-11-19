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


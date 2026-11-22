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
  if (!hasKey() || !navigator.onLine) { save(); renderTrip(); return; } // offline: o trecho fica "não calculado"
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


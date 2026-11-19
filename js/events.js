// ---------- eventos ----------
$('#brandBtn').onclick = goHome;
$('#backBtn').onclick = goHome;
$('#newTripBtn').onclick = () => openDialog(null);
$('#editTripBtn').onclick = () => openDialog(cur());
$('#exportBtn').onclick = exportTrip;

// Alternância entre mapa, detalhes e visualização dividida.
const LAYOUT_KEY = 'mundo-afora.layout';
function setTripLayout(mode, persist = true) {
  const valid = ['map', 'list', 'split'].includes(mode) ? mode : 'split';
  const trip = $('#trip');
  trip.classList.remove('layout-map', 'layout-list', 'layout-split');
  trip.classList.add(`layout-${valid}`);
  document.querySelectorAll('[data-layout]').forEach((button) => {
    const active = button.dataset.layout === valid;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (persist) localStorage.setItem(LAYOUT_KEY, valid);
  requestAnimationFrame(() => { if (map) map.invalidateSize({ animate: false }); });
}
document.querySelectorAll('[data-layout]').forEach((button) => {
  button.addEventListener('click', () => setTripLayout(button.dataset.layout));
});
setTripLayout(localStorage.getItem(LAYOUT_KEY) || 'split', false);
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
  enrich(stop).then(() => {
    save();
    if (cur()?.id === t.id) renderTrip();
  });
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
window.addEventListener('hashchange', syncRouteFromHash);
if (!location.hash) {
  history.replaceState(null, '', `${location.pathname}${location.search}#/viagens`);
}
syncRouteFromHash();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

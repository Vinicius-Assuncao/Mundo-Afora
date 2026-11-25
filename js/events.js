// ---------- eventos ----------
$('#brandBtn').onclick = goHome;
$('#backBtn').onclick = goHome;
$('#newTripBtn').onclick = () => openDialog(null);
$('#editTripBtn').onclick = () => openDialog(cur());
$('#exportBtn').onclick = () => ExportUI.open();

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

$('#mapDayIndicator').onclick = (e) => {
  const overviewButton = e.target.closest('[data-map-view="overview"]');
  if (overviewButton) {
    overview = true;
    renderTrip();
    return;
  }
  const dayButton = e.target.closest('[data-map-day]');
  if (!dayButton) return;
  dayIdx = +dayButton.dataset.mapDay;
  overview = false;
  renderTrip();
};

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

document.querySelectorAll('[data-pt]').forEach((b) => b.onclick = () => { pickerTab = b.dataset.pt; renderPicker(); if (pickerTab === 'flag') loadFlags().then(renderPicker); });
$('#flagFilter').oninput = renderPicker;
$('#applyTripEmoji').onclick = () => {
  const value = $('#customTripEmoji').value.trim();
  if (!validCustomEmoji(value)) return toast('Digite ou cole apenas um emoji válido (sem bandeiras).');
  picked = value; pickerTab = 'emoji'; renderPicker();
};
$('#customTripEmoji').onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); $('#applyTripEmoji').click(); } };
loadFlags();
window.addEventListener('online', () => loadFlags().then(() => { if ($('#tripDlg').open && pickerTab === 'flag') renderPicker(); }));
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
  if (e.target.closest('[data-act="recalculateRoute"]')) {
    if (d.stops.length < 2) return toast('Adicione ao menos duas paradas para recalcular a rota.');
    return withBusy(() => routeDay(d), 'Trajetos recalculados.');
  }
  if (e.target.closest('[data-act="delDay"]')) {
    if (t.days.length === 1) return toast('A viagem precisa ter ao menos um dia.');
    askConfirm({
      title: 'Excluir dia',
      message: `Excluir “${d.name}” e todas as suas paradas? Esta ação não pode ser desfeita.`,
      confirmText: 'Excluir dia',
      icon: 'delete',
    }).then((confirmed) => {
      if (!confirmed) return;
      t.days.splice(dayIdx, 1);
      dayIdx = 0;
      save();
      toast('Dia excluído.');
      renderTrip();
    });
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

function saveStopRename(stopId, value) {
  const d = cur().days[dayIdx];
  const stop = d.stops.find((s) => s.id === stopId);
  if (!stop) return;
  const renamed = value.trim();
  if (!renamed) {
    toast('Informe um nome para a parada.');
    requestAnimationFrame(() => {
      const input = [...$('#stops').querySelectorAll('[data-stop-name]')]
        .find((el) => el.dataset.id === stopId);
      input?.focus();
    });
    return;
  }
  const changed = renamed !== stop.name;
  if (changed) {
    if (stop.wikiName === undefined) stop.wikiName = stop.name;
    stop.name = renamed;
    save();
  }
  stopRenameId = null;
  renderTrip();
  if (changed) toast('Nome atualizado.', 'ok');
}

$('#stops').addEventListener('keydown', (e) => {
  if (!e.target.matches?.('[data-stop-name]')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    saveStopRename(e.target.dataset.id, e.target.value);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    stopRenameId = null;
    renderTrip();
  }
});

async function searchAlternativeStopPhoto(stop, button) {
  if (typeof Offline !== 'undefined' && Offline.isViewOnly()) return toast('A visualização offline não permite alterar fotos.');
  const choices = Array.isArray(stop.photoChoices) && stop.photoChoices.length
    ? stop.photoChoices.slice(0, 2)
    : [{ ...(stop.photoAttribution || {}), url: stop.photo }];
  button.disabled = true;
  let nextPhoto;
  try {
    nextPhoto = await alternativeStopPhoto(stop);
  } catch (error) {
    return toast(error.message || 'Não foi possível buscar outra foto.');
  } finally {
    if (button.isConnected) button.disabled = false;
  }

  if (!nextPhoto) {
    if (stop.photoSearchDone) return;
    stop.photoSearchDone = true;
    save();
    renderTrip();
    return toast('Nenhuma outra foto foi encontrada para esta atração.');
  }

  choices.push(nextPhoto);
  stop.photoChoices = choices;
  stop.photoIndex = Math.max(0, choices.findIndex((photo) => photo.url === stop.photo));
  stop.photoSearchDone = true;
  save();
  renderTrip();
  toast('Outra foto encontrada. Use as setas para alternar.', 'ok');
}

function changeStopPhoto(stop, direction) {
  if (typeof Offline !== 'undefined' && Offline.isViewOnly()) return toast('A visualização offline não permite alterar fotos.');
  const choices = (stop.photoChoices || []).slice(0, 2);
  let index = Number.isInteger(stop.photoIndex) ? stop.photoIndex : choices.findIndex((photo) => photo.url === stop.photo);
  if (!choices[index] || choices[index].url !== stop.photo) index = choices.findIndex((photo) => photo.url === stop.photo);
  if (index < 0) index = 0;
  if (direction < 0 && index > 0) index -= 1;
  else if (direction > 0 && index === 0 && choices.length > 1) index = 1;
  else return;

  const selected = choices[index];
  if (!selected?.url) return toast('Não foi possível carregar esta foto.');
  stop.photoIndex = index;
  stop.photo = selected.url;
  stop.photoAttribution = selected;
  stop.photoCredit = selected.credit || '';
  stop.icon = '';
  save();
  renderTrip();
}

$('#stops').onclick = (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = cur().days[dayIdx];
  const idx = d.stops.findIndex((s) => s.id === b.dataset.id);
  if (idx < 0) return;
  if (b.dataset.act === 'searchPhoto') return searchAlternativeStopPhoto(d.stops[idx], b);
  if (b.dataset.act === 'previousPhoto') return changeStopPhoto(d.stops[idx], -1);
  if (b.dataset.act === 'nextPhoto') return changeStopPhoto(d.stops[idx], 1);
  if (b.dataset.act === 'saveRename') {
    const input = [...$('#stops').querySelectorAll('[data-stop-name]')]
      .find((el) => el.dataset.id === b.dataset.id);
    return saveStopRename(b.dataset.id, input?.value || '');
  }
  if (b.dataset.act === 'cancelRename') {
    stopRenameId = null;
    return renderTrip();
  }
  if (b.dataset.act === 'rename') {
    stopRenameId = b.dataset.id;
    iconEdit = null;
    renderTrip();
    requestAnimationFrame(() => {
      const input = [...$('#stops').querySelectorAll('[data-stop-name]')]
        .find((el) => el.dataset.id === b.dataset.id);
      input?.focus();
      input?.select();
    });
    return;
  }
  if (b.dataset.act === 'icon') { iconEdit = iconEdit === b.dataset.id ? null : b.dataset.id; return renderTrip(); }
  if (b.dataset.act === 'pickIcon' || b.dataset.act === 'pickCustomIcon') {
    const stop = d.stops[idx];
    let value = b.dataset.v || '';
    if (b.dataset.act === 'pickCustomIcon') {
      const input = [...$('#stops').querySelectorAll('[data-custom-stop-emoji]')].find((el) => el.dataset.customStopEmoji === stop.id);
      value = input?.value.trim() || '';
      if (!validCustomEmoji(value)) return toast('Digite ou cole apenas um emoji válido (sem bandeiras).');
    }
    if (stop.photo) stop.originalPhoto = stop.photo;
    stop.icon = value;
    stop.photo = '';
    iconEdit = null;
    save();
    return renderTrip();
  }
  if (b.dataset.act === 'restorePhoto') {
    const stop = d.stops[idx];
    if (stop.originalPhoto) {
      const photoIndex = (stop.photoChoices || []).findIndex((photo) => photo.url === stop.originalPhoto);
      if (photoIndex >= 0) {
        stop.photoIndex = photoIndex;
        stop.photo = stop.photoChoices[photoIndex].url;
        stop.photoAttribution = stop.photoChoices[photoIndex];
        stop.photoCredit = stop.photoAttribution.credit || '';
      } else {
        stop.photo = stop.originalPhoto;
        stop.photoIndex = 0;
      }
      stop.icon = '';
      save();
      return renderTrip();
    }
    return withBusy(async () => {
      const w = await wikiInfo(stop);
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
    t.ideas.push({ id: s.id, name: s.name, wikiName: s.wikiName ?? s.name, wikidataId: s.wikidataId || '', wikipedia: s.wikipedia || '', lat: s.lat, lon: s.lon });
    toast('Parada movida para a lista de ideias.', 'ok');
    return reroute(d);
  }
};

Sortable.create($('#stops'), {
  animation: 160,
  handle: '.stop-drag-handle',
  ghostClass: 'drag-ghost',
  onEnd() {
    const d = cur().days[dayIdx];
    const ids = [...$('#stops').children].map((li) => li.dataset.id);
    d.stops = ids.map((id) => d.stops.find((s) => s.id === id)).filter(Boolean);
    fixLegs(d);
    reroute(d);
  },
});

$('#pickMapPoint').onclick = () => {
  if (typeof Offline !== 'undefined' && Offline.isViewOnly()) return toast('A visualização offline não permite editar paradas.');
  if ($('#pickMapPoint').classList.contains('active')) {
    cancelMapPointSelection();
    return;
  }
  setTripLayout('split');
  startMapPointSelection();
  setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 300);
  toast('Agora clique na localização desejada no mapa.');
};

function askPointDialog({ title, message = '', value = '', confirmText = 'Adicionar', cancelText = 'Cancelar', showInput = true }) {
  const dlg = $('#pointDlg');
  $('#pointTitle').textContent = title;
  $('#pointMessage').textContent = message;
  $('#pointField').classList.toggle('hidden', !showInput);
  $('#pointInput').value = value;
  $('#pointError').classList.add('hidden');
  $('#pointCancel').textContent = cancelText;
  $('#pointConfirm').textContent = confirmText;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dlg.close();
      resolve(value);
    };
    $('#pointCancel').onclick = () => finish(showInput ? null : '__custom__');
    $('#pointConfirm').onclick = () => {
      if (!showInput) return finish('__recognized__');
      const name = $('#pointInput').value.trim();
      if (!name) {
        $('#pointError').textContent = 'Informe um nome para este ponto.';
        $('#pointError').classList.remove('hidden');
        $('#pointInput').focus();
        return;
      }
      finish(name);
    };
    $('#pointInput').onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        $('#pointConfirm').click();
      }
    };
    dlg.oncancel = (event) => {
      event.preventDefault();
      finish(null);
    };
    dlg.showModal();
    setTimeout(() => (showInput ? $('#pointInput').focus() : $('#pointConfirm').focus()), 50);
  });
}

window.handleMapPointSelection = async (lat, lon) => {
  let place;
  try {
    place = await reversePlace(lat, lon);
  } catch (error) {
    const custom = await askPointDialog({
      title: 'Nomeie este ponto',
      message: `${error.message || 'Não foi possível identificar este local.'} Informe um nome para adicioná-lo.`,
      confirmText: 'Adicionar ponto',
    });
    if (!custom) { toast('Ponto não adicionado.'); return; }
    place = { name: custom, wikiName: '', lat, lon, address: '', recognized: false };
  }
  let name = place.name;
  if (!name) {
    name = await askPointDialog({
      title: 'Ponto sem nome conhecido',
      message: 'Nenhum ponto conhecido foi identificado neste local.',
      confirmText: 'Adicionar ponto',
    });
    if (!name) { toast('Ponto não adicionado.'); return; }
    place.name = name;
    place.wikiName = '';
  }
  if (!place.tourist && place.recognized) {
    const choice = await askPointDialog({
      title: 'Ponto identificado',
      message: `O mapa identificou “${name}”. Deseja usar esse nome?`,
      confirmText: 'Usar nome',
      cancelText: 'Personalizar',
      showInput: false,
    });
    if (choice === '__custom__') {
      const custom = await askPointDialog({
        title: 'Personalizar ponto',
        message: 'Digite o nome que deseja usar para esta parada.',
        value: name,
        confirmText: 'Adicionar ponto',
      });
      if (!custom) { toast('Ponto não adicionado.'); return; }
      place.name = custom;   // nome personalizado é só visual: wikiName (nome reconhecido) continua valendo para as consultas
    } else if (choice !== '__recognized__') {
      toast('Ponto não adicionado.');
      return;
    }
  }
  const trip = cur();
  if (!trip || overview) { toast('Abra um dia do roteiro antes de adicionar uma parada.'); return; }
  const day = trip.days[dayIdx];
  const stop = newStop(place);
  if (!place.wikiName && !place.wikidataId && !place.wikipedia) stop.wikiDone = true;
  if (place.wikidataId) stop.wikidataId = place.wikidataId;
  day.stops.push(stop);
  fixLegs(day);
  save(); renderTrip();
  toast(`“${stop.name}” adicionado a ${day.name}.`, 'ok');
  if (!stop.wikiDone) enrich(stop).then(() => { save(); if (cur()?.id === trip.id) renderTrip(); });
  if (day.stops.length > 1 && hasKey()) withBusy(() => legFor(day, day.stops.length - 1));
};

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
    t.ideas.push({ id: uid(), name: place.name, wikiName: place.wikiName ?? place.name, wikidataId: place.wikidataId || '', wikipedia: place.wikipedia || '', lat: place.lat, lon: place.lon });
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

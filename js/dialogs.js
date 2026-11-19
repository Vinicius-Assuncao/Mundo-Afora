// ---------- diálogo de viagem ----------
function renderPicker() {
  document.querySelectorAll('[data-pt]').forEach((b) => b.classList.toggle('on', b.dataset.pt === pickerTab));
  $('#flagFilter').classList.toggle('hidden', pickerTab !== 'flag');
  $('#pickPreview').innerHTML = visual(picked, 'ico');
  const grid = $('#emojiGrid');
  if (pickerTab === 'emoji') {
    grid.className = 'picker-grid emo';
    grid.innerHTML = EMOJIS.map((e) =>
      `<button type="button" class="${e === picked ? 'on' : ''}" data-e="${e}" aria-label="${e}">${e}</button>`).join('');
  } else {
    const q = $('#flagFilter').value.trim().toLowerCase();
    const list = FLAGS.filter(([, n]) => !q || n.toLowerCase().includes(q));
    grid.className = 'picker-grid';
    grid.innerHTML = list.map(([code, name]) => {
      const v = 'flag:' + code;
      return `<button type="button" class="${v === picked ? 'on' : ''}" data-e="${v}" title="${esc(name)}" aria-label="${esc(name)}">
        <img class="flag" src="${flagUrl(code, 80)}" alt="">
      </button>`;
    }).join('') || '<p class="empty-line" style="grid-column:1/-1">Nenhum país encontrado.</p>';
  }
}
function updateDlgInfo() {
  const start = $('#tStart').value;
  const end = $('#tEnd').value;
  const error = $('#dlgError');
  $('#tEnd').min = start || '';
  error.classList.add('hidden');
  if (end && !start) {
    $('#dlgInfo').textContent = 'Informe a data de início para definir a data final.';
    error.textContent = 'A data final precisa de uma data de início.';
    error.classList.remove('hidden');
    return;
  }
  if (start && end && end < start) {
    $('#dlgInfo').textContent = 'Corrija o período para continuar.';
    error.textContent = 'A data final não pode ser anterior à data de início.';
    error.classList.remove('hidden');
    return;
  }
  const n = start ? isoRange(start, end || start).length : 0;
  $('#dlgInfo').textContent = n
    ? `${n} ${n === 1 ? 'dia será criado' : 'dias serão criados'} automaticamente.`
    : 'Sem datas: a viagem começa com um dia.';
}
function openDialog(trip) {
  editingId = trip?.id || null;
  $('#dlgTitle').textContent = trip ? 'Editar viagem' : 'Nova viagem';
  $('#tName').value = trip?.name || '';
  $('#tStart').value = trip?.start || '';
  $('#tEnd').value = trip?.end || '';
  picked = trip?.emoji || '🌍';
  pickerTab = picked.startsWith('flag:') ? 'flag' : 'emoji';
  $('#flagFilter').value = '';
  renderPicker();
  updateDlgInfo();
  $('#tDelete').classList.toggle('hidden', !trip);
  $('#tripDlg').showModal();
  setTimeout(() => $('#tName').focus(), 50);
}
function saveDialog() {
  const name = $('#tName').value.trim() || 'Minha viagem';
  let start = $('#tStart').value, end = $('#tEnd').value;
  if (end && !start) {
    $('#dlgError').textContent = 'Informe a data de início antes de definir a data final.';
    $('#dlgError').classList.remove('hidden');
    $('#tStart').focus();
    return;
  }
  if (start && end && end < start) {
    $('#dlgError').textContent = 'A data final não pode ser anterior à data de início.';
    $('#dlgError').classList.remove('hidden');
    $('#tEnd').focus();
    return;
  }
  if (!start) end = '';

  const inTrip = !$('#trip').classList.contains('hidden');
  let t = editingId ? db.trips.find((x) => x.id === editingId) : null;
  const isNew = !t;
  if (t) {
    Object.assign(t, { name, emoji: picked, start, end });
    isoRange(start, end).forEach((iso) => {
      if (!t.days.some((d) => d.date === iso)) t.days.push(newDay(t.days.length, iso));
    });
  } else {
    const days = isoRange(start, end).map((iso, i) => newDay(i, iso));
    t = { id: uid(), name, emoji: picked, start, end, days: days.length ? days : [newDay(0)], ideas: [] };
    db.trips.push(t);
  }
  save();
  $('#tripDlg').close();
  if (!isNew && inTrip) refreshCurrentTripRoute(t);
  if (isNew) { toast('Viagem criada! Agora adicione os lugares.', 'ok'); openTrip(t.id); }
  else {
    toast('Viagem atualizada.', 'ok');
    if (inTrip) renderTrip();
    renderHome();
  }
}
function deleteTrip() {
  if (!editingId || !confirm('Excluir esta viagem e todos os seus dias?')) return;
  db.trips = db.trips.filter((t) => t.id !== editingId);
  if (db.currentId === editingId) db.currentId = null;
  save();
  $('#tripDlg').close();
  toast('Viagem excluída.');
  goHome();
}

// ---------- importar / exportar ----------
function exportTrip() {
  const t = cur();
  const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${t.name.replace(/[^\w-]+/g, '_')}.json`;
  a.click();
  toast('Arquivo exportado.', 'ok');
}
async function importTrip(e) {
  try {
    const file = e.target.files?.[0];
    if (!file) return;
    const t = JSON.parse(await file.text());
    if (!Array.isArray(t.days) || !t.name) throw new Error('Arquivo inválido.');
    t.id = uid();
    t.ideas = t.ideas || [];
    db.trips.push(t);
    openTrip(t.id);
    toast('Viagem importada.', 'ok');
  } catch (err) { toast(err.message || 'Não foi possível importar.'); }
  e.target.value = '';
}


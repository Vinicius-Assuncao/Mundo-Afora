// ---------- exportação: diálogo, opções e pré-visualização ----------
const ExportUI = (() => {
  const $e = (s) => document.querySelector(s);
  const PREF_KEY = 'mundo-afora.export.v1';
  const OPT_LABELS = [
    ['maps', 'Mapas', 'map'], ['photos', 'Fotos das atrações', 'photo_camera'], ['times', 'Horários', 'schedule'],
    ['duration', 'Duração das visitas', 'timer'], ['legs', 'Deslocamentos e transporte', 'directions_walk'],
  ];
  const PNG_SIZES = [
    ['stories', 'Stories · 1080 × 1920 px'], ['feed', 'Feed 4:5 · 1080 × 1350 px'], ['long', 'Longo · 1080 px de largura'],
  ];
  const THUMBS = {
    elegante: '<svg viewBox="0 0 64 84"><rect width="64" height="84" rx="5" fill="#fbf9f5"/><rect x="8" y="10" width="12" height="2.5" fill="#b08a4f"/><rect x="8" y="17" width="38" height="5" fill="#24323f"/><rect x="8" y="27" width="48" height=".8" fill="#d6d0c2"/><rect x="8" y="34" width="24" height="3.5" fill="#24323f"/><rect x="8" y="40" width="30" height="2" fill="#b9b3a5"/><rect x="40" y="32" width="16" height="12" fill="#d6d0c2"/><rect x="8" y="50" width="48" height=".8" fill="#d6d0c2"/><rect x="8" y="57" width="26" height="3.5" fill="#24323f"/><rect x="40" y="55" width="16" height="12" fill="#d6d0c2"/></svg>',
    organizado: '<svg viewBox="0 0 64 84"><rect width="64" height="84" rx="5" fill="#f3f6f9"/><rect x="0" y="0" width="64" height="6" fill="#2f5d8a"/><rect x="6" y="11" width="52" height="12" rx="3" fill="#2f5d8a"/><rect x="6" y="27" width="16" height="9" rx="2" fill="#fff"/><rect x="24" y="27" width="16" height="9" rx="2" fill="#fff"/><rect x="42" y="27" width="16" height="9" rx="2" fill="#fff"/><rect x="12" y="41" width="1.5" height="38" fill="#c9d3dc"/><circle cx="12.7" cy="46" r="3" fill="#2f5d8a"/><circle cx="12.7" cy="62" r="3" fill="#2f5d8a"/><rect x="19" y="41" width="39" height="13" rx="3" fill="#fff"/><rect x="19" y="57" width="39" height="13" rx="3" fill="#fff"/></svg>',
    colorido: '<svg viewBox="0 0 64 84"><rect width="64" height="84" rx="5" fill="#fff8ee"/><rect x="5" y="6" width="54" height="22" rx="9" fill="#ff6b4a"/><circle cx="16" cy="17" r="6" fill="#fff"/><rect x="26" y="12" width="28" height="4" rx="2" fill="#fff"/><rect x="26" y="19" width="18" height="3" rx="1.5" fill="#ffd2c8"/><rect x="5" y="33" width="54" height="16" rx="8" fill="#fff" stroke="#2ec4b6" stroke-width="2"/><circle cx="15" cy="41" r="5" fill="#2ec4b6"/><rect x="5" y="54" width="54" height="16" rx="8" fill="#fff" stroke="#ffb703" stroke-width="2"/><circle cx="15" cy="62" r="5" fill="#ffb703"/><rect x="44" y="37" width="11" height="8" rx="3" fill="#2ec4b6" opacity=".5"/></svg>',
    diario: '<svg viewBox="0 0 64 84"><rect width="64" height="84" rx="5" fill="#f4ecd8"/><rect x="9" y="0" width="1" height="84" fill="#d99a8c"/><rect x="14" y="8" width="26" height="4" rx="1" fill="#5b4636"/><g transform="rotate(-4 24 30)"><rect x="12" y="17" width="26" height="26" fill="#fff"/><rect x="15" y="20" width="20" height="16" fill="#d8c9a8"/><rect x="19" y="14" width="12" height="4" fill="#ffd666" opacity=".9"/></g><rect x="44" y="24" width="14" height="2.5" fill="#5b4636"/><rect x="44" y="30" width="10" height="2" fill="#b3a58b"/><g transform="rotate(3 44 58)"><rect x="30" y="48" width="26" height="24" fill="#fff"/><rect x="33" y="51" width="20" height="14" fill="#d8c9a8"/></g><rect x="14" y="76" width="30" height=".8" fill="#c9bb9d"/></svg>',
  };

  let trip = null, state = null, previewDoc = null, renderToken = 0, timer = null, lastPlan = null;
  let running = null, offAssets = null, mounted = false;

  const defaults = () => ({
    format: 'pdf', paper: 'a4', png: 'stories', scope: 'trip', oneDay: '', days: [], template: 'elegante',
    colorsBy: {}, previewKey: '',
    opts: { coverPdf: true, coverPng: false, maps: true, photos: true, times: true, duration: true, legs: true },
  });
  function loadPrefs() {
    const s = defaults();
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
      if (p) {
        ['format', 'paper', 'png', 'template'].forEach((k) => { if (p[k]) s[k] = p[k]; });
        if (p.colorsBy) s.colorsBy = p.colorsBy;
        if (p.opts) Object.keys(s.opts).forEach((k) => { if (typeof p.opts[k] === 'boolean') s.opts[k] = p.opts[k]; });
      }
    } catch { /* preferências inválidas: usa o padrão */ }
    return s;
  }
  function savePrefs() {
    const { format, paper, png, template, colorsBy, opts } = state;
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ format, paper, png, template, colorsBy, opts })); } catch { /* sem armazenamento */ }
  }
  const tpl = () => ExportTemplates.get(state.template);
  const colors = () => ({ ...tpl().palette, ...(state.colorsBy[state.template] || {}) });
  const view = () => ({ ...state, colors: colors() });

  // ---------- montagem do formulário ----------
  function mount() {
    if (mounted) return;
    mounted = true;
    $e('#exOpts').innerHTML = `
      <div class="ex-group"><span class="label">Formato</span>
        <div class="ex-formats" role="group" aria-label="Formato do arquivo">
          <button type="button" data-fmt="png"><span class="material-symbols-outlined" aria-hidden="true">image</span><b>PNG</b><small>Para compartilhar</small></button>
          <button type="button" data-fmt="pdf"><span class="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span><b>PDF</b><small>Para imprimir</small></button>
          <button type="button" data-fmt="json"><span class="material-symbols-outlined" aria-hidden="true">data_object</span><b>JSON</b><small>Backup</small></button>
        </div>
        <label class="ex-inline" id="exPaperRow"><span>Papel</span><select id="exPaper"><option value="a4">A4</option><option value="letter">Carta (Letter)</option></select></label>
        <label class="ex-inline" id="exPngRow"><span>Tamanho</span><select id="exPng">${PNG_SIZES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      </div>
      <div class="ex-group" data-visual><span class="label">O que exportar</span>
        <div class="ex-scope" role="radiogroup" aria-label="Conteúdo">
          ${[['trip', 'Viagem completa'], ['overview', 'Resumo geral'], ['day', 'Apenas um dia'], ['days', 'Dias selecionados']].map(([v, l]) =>
            `<label class="ex-radio"><input type="radio" name="exScope" value="${v}"><span>${l}</span></label>`).join('')}
        </div>
        <label class="ex-inline hidden" id="exDayRow"><span>Dia</span><select id="exDay"></select></label>
        <div class="ex-days hidden" id="exDaysRow" role="group" aria-label="Dias a exportar"></div>
      </div>
      <div class="ex-group" data-visual><span class="label">Modelo</span>
        <div class="ex-tpls" role="radiogroup" aria-label="Modelo visual">
          ${ExportTemplates.list.map((t) => `<label class="ex-tpl"><input type="radio" name="exTpl" value="${t.id}"><span class="ex-thumb">${THUMBS[t.id]}</span><b>${t.name}</b><small>${t.blurb}</small></label>`).join('')}
        </div>
      </div>
      <div class="ex-group" data-visual><span class="label">Cores</span>
        <div class="ex-colors">
          ${[['main', 'Principal'], ['bg', 'Fundo'], ['accent', 'Destaque']].map(([k, l]) => `<label class="ex-color"><input type="color" data-color="${k}" aria-label="Cor ${l.toLowerCase()}"><span>${l}</span></label>`).join('')}
          <button type="button" class="btn sm ghost" id="exResetColors">Restaurar</button>
        </div>
      </div>
      <div class="ex-group" data-visual><span class="label">Incluir</span>
        <div class="ex-toggles">
          <label class="ex-sw"><input type="checkbox" data-opt="cover"><span class="ex-knob"></span><span id="exCoverLabel">Capa</span></label>
          ${OPT_LABELS.map(([k, l]) => `<label class="ex-sw"><input type="checkbox" data-opt="${k}"><span class="ex-knob"></span><span>${l}</span></label>`).join('')}
        </div>
        <div class="ex-cover-media hidden" id="exCoverMedia">
          <label class="ex-inline hidden" id="exCoverSelectRow"><span>Foto da capa</span><select id="exCoverSelect"></select></label>
          <label class="ex-cover-upload"><span>Enviar foto para a capa</span><input id="exCoverFile" type="file" accept="image/*"></label>
          <button type="button" class="btn sm ghost hidden" id="exRemoveCover">Remover foto enviada</button>
          <p class="ex-hint" id="exCoverNote"></p>
        </div>
      </div>
      <p class="ex-note hidden" id="exJsonNote"><b>Backup completo.</b> Exporta todos os dados da viagem em JSON para guardar ou importar em outro aparelho.</p>`;
    bind();
  }

  function bind() {
    const o = $e('#exOpts');
    o.addEventListener('click', (e) => {
      const f = e.target.closest('[data-fmt]');
      if (f) { state.format = f.dataset.fmt; changed(); return; }
      const d = e.target.closest('[data-day]');
      if (d) {
        const id = d.dataset.day;
        state.days = state.days.includes(id) ? state.days.filter((x) => x !== id) : [...state.days, id];
        changed(); return;
      }
      if (e.target.closest('[data-alldays]')) { state.days = state.days.length === trip.days.length ? [] : trip.days.map((x) => x.id); changed(); return; }
      if (e.target.closest('#exResetColors')) { delete state.colorsBy[state.template]; changed(); }
      if (e.target.closest('#exRemoveCover')) { removeCoverPhoto(); return; }
    });
    o.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'exScope') state.scope = t.value;
      else if (t.name === 'exTpl') { state.template = t.value; }
      else if (t.id === 'exPaper') state.paper = t.value;
      else if (t.id === 'exPng') state.png = t.value;
      else if (t.id === 'exDay') state.oneDay = t.value;
      else if (t.id === 'exCoverSelect') { trip.coverStopId = t.value; save(); changed(); }
      else if (t.id === 'exCoverFile') { const file = t.files?.[0]; t.value = ''; if (file) uploadCoverPhoto(file); }
      else if (t.dataset.opt) {
        const k = t.dataset.opt === 'cover' ? (state.format === 'pdf' ? 'coverPdf' : 'coverPng') : t.dataset.opt;
        state.opts[k] = t.checked;
      }
      changed();
    });
    o.addEventListener('input', (e) => {
      const c = e.target.dataset?.color;
      if (!c) return;
      state.colorsBy[state.template] = { ...colors(), [c]: e.target.value };
      changed(true);
    });
    $e('#exTarget').addEventListener('change', (e) => { state.previewKey = e.target.value; refresh(); });
    $e('#exClose').onclick = () => closeDialog();
    $e('#exCancel').onclick = () => closeDialog();
    $e('#exGo').onclick = generate;
    document.querySelectorAll('[data-extab]').forEach((b) => { b.onclick = () => setTab(b.dataset.extab); });
    $e('#exportDlg').addEventListener('cancel', (e) => { if (running) { e.preventDefault(); running.abort(); } });
    $e('#exportDlg').addEventListener('close', cleanup);
  }
  function setTab(tab) {
    $e('#exBody').dataset.tab = tab;
    document.querySelectorAll('[data-extab]').forEach((b) => { const on = b.dataset.extab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    if (tab === 'preview') paintPreview();
  }

  // ---------- sincronização dos controles ----------
  function coverChoices() {
    const choices = [];
    trip.days.forEach((day, dayIndex) => day.stops.forEach((stop) => {
      if (stop.photo) choices.push({ value: stop.id, label: `Dia ${dayIndex + 1} · ${stop.name || 'Parada'}` });
    }));
    if (trip.coverPhoto) choices.push({ value: 'uploaded', label: 'Foto enviada' });
    return choices;
  }

  function readCoverPhoto(file) {
    if (!file.type.startsWith('image/')) return Promise.reject(new Error('Escolha um arquivo de imagem.'));
    if (file.size > 15 * 1024 * 1024) return Promise.reject(new Error('A imagem deve ter no máximo 15 MB.'));
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      const release = () => URL.revokeObjectURL(url);
      image.onerror = () => { release(); reject(new Error('Não foi possível abrir essa imagem.')); };
      image.onload = () => {
        try {
          if (!image.naturalWidth || !image.naturalHeight
            || image.naturalWidth * image.naturalHeight > 50000000) {
            throw new Error('A imagem tem dimensões grandes demais.');
          }
          const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Não foi possível processar a imagem.');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        } catch (error) {
          reject(error);
        } finally {
          release();
        }
      };
      image.src = url;
    });
  }

  async function uploadCoverPhoto(file) {
    showError('');
    try {
      trip.coverPhoto = await readCoverPhoto(file);
      trip.coverStopId = 'uploaded';
      save();
      changed();
      toast('Foto da capa salva na viagem.', 'ok');
    } catch (error) {
      showError(`Não foi possível usar essa imagem: ${error.message}`);
    }
  }

  function removeCoverPhoto() {
    trip.coverPhoto = '';
    if (trip.coverStopId === 'uploaded') {
      trip.coverStopId = coverChoices().find((choice) => choice.value !== 'uploaded')?.value || '';
    }
    save();
    changed();
  }

  function syncControls() {
    const o = $e('#exOpts');
    const json = state.format === 'json';
    $e('#exTargetRow').classList.add('hidden');
    o.querySelectorAll('[data-fmt]').forEach((b) => { const on = b.dataset.fmt === state.format; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    $e('#exPaperRow').classList.toggle('hidden', state.format !== 'pdf');
    $e('#exPngRow').classList.toggle('hidden', state.format !== 'png');
    $e('#exPaper').value = state.paper;
    $e('#exPng').value = state.png;
    o.querySelectorAll('[data-visual]').forEach((g) => g.classList.toggle('hidden', json));
    $e('#exJsonNote').classList.toggle('hidden', !json);
    o.querySelectorAll('input[name="exScope"]').forEach((r) => { r.checked = r.value === state.scope; });
    o.querySelectorAll('input[name="exTpl"]').forEach((r) => { r.checked = r.value === state.template; });
    const previewTab = document.querySelector('[data-extab="preview"]');
    previewTab.classList.toggle('hidden', json);
    if (json && $e('#exBody').dataset.tab === 'preview') setTab('opts');
    // dias
    $e('#exDayRow').classList.toggle('hidden', state.scope !== 'day');
    $e('#exDaysRow').classList.toggle('hidden', state.scope !== 'days');
    $e('#exDay').innerHTML = trip.days.map((d, i) => `<option value="${d.id}" ${d.id === state.oneDay ? 'selected' : ''}>${esc(`Dia ${i + 1}${d.name && !/^dia\s*\d+$/i.test(d.name) ? ` · ${d.name}` : ''}`)}</option>`).join('');
    $e('#exDaysRow').innerHTML = `<button type="button" class="ex-chip ex-all" data-alldays>${state.days.length === trip.days.length ? 'Limpar' : 'Todos'}</button>`
      + trip.days.map((d, i) => `<button type="button" class="ex-chip ${state.days.includes(d.id) ? 'on' : ''}" data-day="${d.id}" aria-pressed="${state.days.includes(d.id)}" style="--c:${d.color}"><i></i>${i + 1}${d.name && !/^dia\s*\d+$/i.test(d.name) ? ` · ${esc(M_trunc(d.name, 14))}` : ''}</button>`).join('');
    // cores
    const c = colors();
    o.querySelectorAll('[data-color]').forEach((i) => { i.value = c[i.dataset.color]; });
    // alternâncias
    const pdf = state.format === 'pdf';
    o.querySelectorAll('[data-opt]').forEach((i) => {
      const k = i.dataset.opt === 'cover' ? (pdf ? 'coverPdf' : 'coverPng') : i.dataset.opt;
      i.checked = !!state.opts[k];
    });
    $e('#exCoverLabel').textContent = pdf ? 'Capa' : 'Imagem de capa';
    const coverInput = o.querySelector('[data-opt="cover"]');
    const coverBlocked = !pdf && state.scope !== 'trip';
    coverInput.closest('.ex-sw').classList.toggle('hidden', coverBlocked);
    const coverKey = pdf ? 'coverPdf' : 'coverPng';
    const coverMedia = $e('#exCoverMedia');
    const mediaVisible = !coverBlocked && !!state.opts[coverKey];
    coverMedia.classList.toggle('hidden', !mediaVisible);
    const choices = coverChoices();
    const selected = choices.some((choice) => choice.value === trip.coverStopId)
      ? trip.coverStopId
      : (choices.find((choice) => choice.value !== 'uploaded') || choices[0])?.value || '';
    $e('#exCoverSelect').innerHTML = choices.map((choice) =>
      `<option value="${esc(choice.value)}">${esc(choice.label)}</option>`).join('');
    $e('#exCoverSelect').value = selected;
    $e('#exCoverSelectRow').classList.toggle('hidden', !mediaVisible || !choices.length);
    $e('#exRemoveCover').classList.toggle('hidden', !mediaVisible || !trip.coverPhoto);
    $e('#exCoverNote').textContent = trip.coverPhoto
      ? 'A foto enviada fica salva nesta viagem; selecione-a acima para usar na capa.'
      : 'Escolha a foto de uma parada ou envie uma imagem. Se nenhuma for escolhida, será usada a primeira foto disponível.';
    // pré-visualização/rodapé do formato JSON
    $e('#exPreviewCol').classList.toggle('is-json', json);
  }
  const M_trunc = (t, n) => ExportModel.truncate(t, n);

  function changed(colorOnly = false) {
    // quando a viagem tem uma única seleção válida, garante estados coerentes
    if (state.scope === 'day' && !trip.days.some((d) => d.id === state.oneDay)) state.oneDay = trip.days[0]?.id || '';
    savePrefs();
    if (!colorOnly) syncControls();
    schedule();
  }
  function schedule(delay = 140) {
    clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  }

  // ---------- pré-visualização ----------
  async function ensurePreviewFrame() {
    if (previewDoc) return previewDoc;
    const { doc } = await ExportAssets.createFrame({ visible: true });
    doc.head.insertAdjacentHTML('beforeend', `<style>
      html,body{background:#e9edf0}
      body{padding:18px 0 4px}
      .pvw{margin:0 auto 20px;box-shadow:0 10px 30px rgba(20,40,60,.2);overflow:hidden;background:#fff}
      .pvi{transform-origin:0 0}
    </style>`);
    ExportAssets.ensureFonts(doc);
    previewDoc = doc;
    return doc;
  }
  function paintPreview() {
    if (!previewDoc || !lastPlan) return;
    const host = $e('#exPreviewHost');
    const pages = lastPlan.pages.filter((p) => p.section.key === state.previewKey);
    const root = previewDoc.getElementById('root');
    if (!pages.length) { root.innerHTML = ''; return; }
    const avail = Math.max(240, host.clientWidth - 36);
    const scale = Math.min(1, avail / pages[0].w);
    root.innerHTML = pages.map((p) => `<div class="pvw" style="width:${Math.round(p.w * scale)}px;height:${Math.round(p.height * scale)}px"><div class="pvi" style="width:${p.w}px;height:${p.height}px;transform:scale(${scale})">${p.html}</div></div>`).join('');
  }
  function updateSummary() {
    const sum = $e('#exSummary');
    const go = $e('#exGo');
    if (state.format === 'json') {
      const stops = trip.days.reduce((n, d) => n + d.stops.length, 0);
      sum.textContent = `Arquivo JSON · ${trip.days.length} ${trip.days.length === 1 ? 'dia' : 'dias'} · ${stops} ${stops === 1 ? 'parada' : 'paradas'}`;
      go.disabled = false;
      return;
    }
    if (!lastPlan || !lastPlan.pages.length) {
      sum.textContent = state.scope === 'days' ? 'Selecione ao menos um dia para exportar.' : 'Nada para exportar.';
      go.disabled = true;
      return;
    }
    go.disabled = false;
    const n = lastPlan.pages.length;
    const f = lastPlan.fmt;
    if (f.kind === 'pdf') sum.textContent = `PDF · ${f.label} · ${n} ${n === 1 ? 'página' : 'páginas'}`;
    else {
      const split = [...new Set(lastPlan.pages.filter((p) => p.parts > 1).map((p) => p.section.label))];
      sum.textContent = `PNG · ${n} ${n === 1 ? 'imagem' : 'imagens'}${n > 1 ? ' em um ZIP' : ''}${split.length ? ` · ${split.join(', ')} ocupa mais de uma imagem` : ''}`;
    }
  }
  async function refresh() {
    if (!$e('#exportDlg').open || running) return;
    if (state.format === 'json') { updateSummary(); return; }
    const token = ++renderToken;
    const v = view();
    const sectionKeys = ExportEngine.sectionsFor(v, ExportModel.build(trip)).map((s) => s.key);
    if (!sectionKeys.includes(state.previewKey)) state.previewKey = sectionKeys[0] || '';
    try {
      await ensurePreviewFrame();
      const plan = await ExportEngine.plan(v, trip, { activeKeys: new Set([state.previewKey]) });
      if (token !== renderToken) return;
      lastPlan = plan;
    } catch (err) {
      console.warn('[Mundo Afora] prévia da exportação:', err);
      $e('#exSummary').textContent = 'Não foi possível montar a prévia. Tente alterar as opções.';
      return;
    }
    const keys = [];
    lastPlan.pages.forEach((p) => { if (!keys.some((k) => k.key === p.section.key)) keys.push({ key: p.section.key, label: p.section.label }); });
    $e('#exTarget').innerHTML = keys.map((k) => `<option value="${esc(k.key)}" ${k.key === state.previewKey ? 'selected' : ''}>${esc(k.label)}</option>`).join('');
    $e('#exTargetRow').classList.toggle('hidden', keys.length < 2);
    updateSummary();
    paintPreview();
  }

  // ---------- geração ----------
  function setBusy(busy, text = '') {
    const dlg = $e('#exportDlg');
    dlg.classList.toggle('is-busy', busy);
    $e('#exOpts').toggleAttribute('inert', busy);
    $e('#exProgress').classList.toggle('hidden', !busy);
    $e('#exSummary').classList.toggle('hidden', busy);
    $e('#exClose').disabled = false;
    $e('#exCancel').textContent = busy ? 'Cancelar geração' : 'Cancelar';
    $e('#exGo').disabled = busy;
    if (busy) $e('#exProgressText').textContent = text;
  }
  function progress(fraction, text) {
    $e('#exProgressBar').style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    $e('#exProgressText').textContent = text;
  }
  function showError(msg) {
    const el = $e('#exError');
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }
  async function generate() {
    showError('');
    if (state.format === 'json') {
      exportTrip(); // exportação JSON original, inalterada (js/dialogs.js)
      closeDialog();
      return;
    }
    if (running) return;
    const controller = new AbortController();
    running = controller;
    setBusy(true, 'Preparando…');
    progress(0.02, 'Preparando…');
    try {
      const result = await ExportEngine.run(view(), trip, { signal: controller.signal, onProgress: progress });
      ExportFiles.download(result.blob, result.filename);
      running = null;
      setBusy(false);
      toast(result.kind === 'zip' ? `${result.count} imagens exportadas em um ZIP.` : result.kind === 'pdf' ? 'PDF exportado.' : 'Imagem exportada.', 'ok');
      closeDialog();
    } catch (err) {
      running = null;
      setBusy(false);
      if (err?.name === 'AbortError') { toast('Exportação cancelada.'); refresh(); return; }
      console.error('[Mundo Afora] exportação:', err);
      showError(err?.message || 'Não foi possível gerar o arquivo. Tente novamente.');
      refresh();
    }
  }

  // ---------- abertura e fechamento ----------
  function open() {
    trip = cur();
    if (!trip) return;
    mount();
    state = loadPrefs();
    state.oneDay = !overview && trip.days[dayIdx] ? trip.days[dayIdx].id : trip.days[0]?.id || '';
    state.days = trip.days.map((d) => d.id);
    state.previewKey = '';
    lastPlan = null;
    $e('#exSub').textContent = trip.name;
    showError('');
    setBusy(false);
    syncControls();
    setTab('opts');
    $e('#exportDlg').showModal();
    offAssets = ExportAssets.onChange(() => schedule(300));
    // aquece o cache de imagens para a prévia e a exportação
    const urls = trip.days.flatMap((d) => d.stops.map((s) => s.photo)).filter(Boolean);
    ExportAssets.preload(urls);
    ExportAssets.loadHtml2Canvas().catch(() => {});
    refresh();
  }
  function closeDialog() {
    if (running) { running.abort(); return; }
    $e('#exportDlg').close();
  }
  function cleanup() {
    clearTimeout(timer);
    renderToken++;
    offAssets?.(); offAssets = null;
    previewDoc?.defaultView?.frameElement?.remove();
    previewDoc = null; lastPlan = null;
    ExportEngine.dispose();
  }
  window.addEventListener('resize', () => { if (previewDoc && $e('#exportDlg').open) paintPreview(); });

  return { open };
})();

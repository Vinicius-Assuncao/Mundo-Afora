// ---------- telas ----------
function show(view) {
  document.body.classList.toggle('in-trip', view === 'trip');
  if (view === 'home') {
    $('#top').style.removeProperty('--trip-color');
    $('#top').style.removeProperty('--trip-color-dark');
    $('#top').style.removeProperty('--trip-ink');
  }
  $('#home').classList.toggle('hidden', view !== 'home');
  $('#trip').classList.toggle('hidden', view !== 'trip');
  $('#backBtn').classList.toggle('hidden', view === 'home');
  $('#editTripBtn').classList.toggle('hidden', view !== 'trip');
  $('#exportBtn').classList.toggle('hidden', view !== 'trip');
  if (view === 'home') $('#topTitle').innerHTML = '';
  window.scrollTo(0, 0);
  if (typeof Offline !== 'undefined') Offline.apply();
}
// Rotas legíveis no hash: #/viagens e #/nome-da-viagem.
function slugifyTripName(name) {
  return String(name || 'viagem')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'viagem';
}

function tripRoute(trip) {
  const slug = slugifyTripName(trip.name);
  if (slug === 'viagens') return `${slug}-${trip.id}`;
  const duplicates = db.trips.filter((item) => slugifyTripName(item.name).toLowerCase() === slug.toLowerCase());
  return duplicates.length > 1 ? `${slug}-${trip.id}` : slug;
}

function updateHash(path, replace = false) {
  const nextHash = `#/${path}`;
  if (location.hash === nextHash) {
    syncRouteFromHash();
    return;
  }
  if (replace) {
    history.replaceState(null, '', `${location.pathname}${location.search}${nextHash}`);
    syncRouteFromHash();
  } else {
    location.hash = nextHash;
  }
}

function syncRouteFromHash() {
  let route = '';
  try { route = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/+$/, ''); }
  catch { route = ''; }

  if (!route || route === 'viagens') {
    if (db.currentId !== null) { db.currentId = null; save(); }
    show('home');
    renderHome();
    return;
  }

  let trip = db.trips.find((item) => tripRoute(item) === route);
  // Aceita links antigos se duas viagens tiverem o mesmo nome.
  if (!trip) trip = db.trips.find((item) => slugifyTripName(item.name).toLowerCase() === route.toLowerCase());
  if (!trip) {
    history.replaceState(null, '', `${location.pathname}${location.search}#/viagens`);
    db.currentId = null;
    save();
    show('home');
    renderHome();
    return;
  }

  if (db.currentId !== trip.id) { dayIdx = 0; overview = true; }
  db.currentId = trip.id;
  save();
  show('trip');
  map.invalidateSize();
  renderTrip();
}

function goHome() { updateHash('viagens'); }
function openTrip(id) {
  const trip = db.trips.find((item) => item.id === id);
  if (!trip) return goHome();
  dayIdx = 0;
  overview = true;
  updateHash(tripRoute(trip));
}

function refreshCurrentTripRoute(trip) {
  if (db.currentId !== trip.id) return;
  const nextHash = `#/${tripRoute(trip)}`;
  if (location.hash !== nextHash) {
    history.replaceState(null, '', `${location.pathname}${location.search}${nextHash}`);
  }
}

function renderHome() {
  const trips = sortedTrips();
  const stops = db.trips.reduce((s, t) => s + t.days.reduce((x, d) => x + d.stops.length, 0), 0);
  $('#heroStats').textContent = db.trips.length
    ? `${db.trips.length} ${db.trips.length === 1 ? 'viagem' : 'viagens'} · ${stops} ${stops === 1 ? 'parada' : 'paradas'} planejadas`
    : '';
  $('#tripCards').innerHTML = trips.map((t) => {
    const n = t.days.reduce((s, d) => s + d.stops.length, 0);
    const c1 = tripColor(t);
    const c2 = shadeColor(c1);
    return `
    <article class="card trip-card" data-id="${t.id}" tabindex="0" role="group" aria-roledescription="cartão de viagem; pressione Enter para abrir" aria-label="${esc(t.name)}" style="--c:${c1};--c2:${c2}">
      <div class="trip-cover"><div class="trip-icon">${!t.emoji || t.emoji === '🌍' ? '<img class="trip-default-icon" src="icon.png" alt="">' : visual(t.emoji, 'ico')}</div><span class="cover-label">SEU ROTEIRO</span></div>
      <button type="button" class="btn edit" data-edit="${t.id}" aria-label="Editar viagem ${esc(t.name)}"><span class="material-symbols-outlined" aria-hidden="true">edit</span><span>Editar</span></button>
      <div class="trip-body">
        <h3>${esc(t.name)}</h3>
        <p class="dates">${dateRange(t)}</p>
        <div class="meta"><span class="chip"><span class="material-symbols-outlined" aria-hidden="true">calendar_month</span> ${t.days.length} ${t.days.length === 1 ? 'dia' : 'dias'}</span><span class="chip"><span class="material-symbols-outlined" aria-hidden="true">place</span> ${n} ${n === 1 ? 'parada' : 'paradas'}</span></div>
        <div class="trip-card-footer"><span>${n ? 'Roteiro em andamento' : 'Pronto para planejar'}</span><b>Abrir roteiro <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></b></div>
      </div>
    </article>`;
  }).join('') || `
    <div class="empty">
      <div class="big-emoji">🧭</div>
      <p><b>Nenhuma viagem ainda.</b></p>
      <p>Crie a primeira e comece a montar o seu roteiro.</p>
      <button class="btn primary" data-new><span class="material-symbols-outlined" aria-hidden="true">add</span> Nova viagem</button>
    </div>`;
}

function renderTrip() {
  const t = cur();
  if (!t) return goHome();
  if (dayIdx >= t.days.length) dayIdx = 0;
  const color = tripColor(t);
  $('#top').style.setProperty('--trip-color', color);
  $('#top').style.setProperty('--trip-color-dark', shadeColor(color));
  $('#top').style.setProperty('--trip-ink', tripColorInk(color));
  $('#topTitle').innerHTML = `${visual(t.emoji || '🌍', 'emo')}<span>${esc(t.name)}</span>`;
  renderDaysNav(t);
  renderMapDayIndicator(t);
  $('#searchForm').classList.toggle('hidden', overview);
  $('.search-section').classList.toggle('hidden', overview);
  $('#results').classList.toggle('hidden', overview);
  $('.ideas').classList.toggle('hidden', overview);
  $('#stops').classList.toggle('hidden', overview);
  $('#summary').classList.toggle('hidden', overview);
  $('#overviewDays').classList.toggle('hidden', !overview);
  if (overview) {
    renderOverview(t);
  } else {
    renderDayHead(t);
    renderSummary(t);
    renderStops(t);
    renderIdeas(t);
  }
  drawMap(t);
  ensureWiki(t);
  if (typeof Offline !== 'undefined') Offline.onTripShown(t);
}

function renderDaysNav(t) {
  $('#daysNav').innerHTML = `
    <button class="tab overview-tab ${overview ? 'on' : ''}" data-act="overview" aria-pressed="${overview}">
      <b>Visão geral</b><small>Toda a viagem</small>
    </button>` + t.days.map((d, i) => `
    <button class="tab ${!overview && i === dayIdx ? 'on' : ''}" data-i="${i}" style="--c:${d.color}" aria-pressed="${!overview && i === dayIdx}">
      <b>${esc(d.name)}</b><small>${d.date ? fmtDate(d.date) : 'sem data'} · ${d.stops.length} ${d.stops.length === 1 ? 'parada' : 'paradas'}</small>
    </button>`).join('') + `<button type="button" class="tab add" data-act="addDay"><b><span class="material-symbols-outlined" aria-hidden="true">add</span> Novo dia</b><small>Adicionar ao roteiro</small></button>`;
}

function renderMapDayIndicator(t) {
  const indicator = $('#mapDayIndicator');
  if (!indicator || !t) return;
  indicator.innerHTML = `
    <button type="button" class="map-day-chip map-day-overview ${overview ? 'active' : ''}" data-map-view="overview" aria-pressed="${overview}">
      <span class="material-symbols-outlined" aria-hidden="true">calendar_month</span>
      <span>Tudo</span>
    </button>` + t.days.map((d, i) => `
    <button type="button" class="map-day-chip ${!overview && i === dayIdx ? 'active' : ''}" data-map-day="${i}" aria-pressed="${!overview && i === dayIdx}" style="--map-day-color:${d.color}">
      <span class="map-day-dot"></span>
      <span>${esc(d.name)}</span>
    </button>`).join('');
}

function renderOverview(t) {
  const tot = totals(t.days);
  $('#dayHead').innerHTML = `
    <div class="dh">
      <h2>Visão geral</h2>
    </div>
    <p class="dates" style="margin-top:4px">${dateRange(t)}</p>`;
  $('#overviewDays').innerHTML = `
    <div class="overview-stats">
      <div class="stat"><b><span class="material-symbols-outlined" aria-hidden="true">calendar_month</span> ${t.days.length}</b><span>dias</span></div>
      <div class="stat"><b><span class="material-symbols-outlined" aria-hidden="true">place</span> ${tot.stops}</b><span>paradas</span></div>
      <div class="stat"><b><span class="material-symbols-outlined" aria-hidden="true">route</span> ${tot.pending ? 'A calcular' : tot.km.toFixed(1)}</b><span>km de trajeto</span></div>
      <div class="stat"><b><span class="material-symbols-outlined" aria-hidden="true">schedule</span> ${fmt(tot.visit)}</b><span>visitas</span></div>
      </div>
    <div class="overview-grid">
      ${t.days.map((d, i) => {
        const dt = totals([d]);
        return `
        <article class="overview-day" style="--c:${d.color}" data-day="${i}" role="button" tabindex="0" aria-label="Abrir ${esc(d.name)}">
          <header class="overview-day-head">
            <h3>${esc(d.name)}</h3>
            <small>${d.date ? fmtDate(d.date) : 'sem data'}</small>
          </header>
          <div class="overview-day-body">
            <div class="summary">
              <span class="chip">${d.stops.length} ${d.stops.length === 1 ? 'parada' : 'paradas'}</span>
              <span class="chip">${routeDistanceLabel(dt)}</span>
            </div>
            ${d.stops.length
              ? `<ol>${d.stops.map((s, j) => `
                  <li>
            ${s.icon ? `<span class="thumb">${esc(s.icon)}</span>` : (s.photo ? `<img class="thumb" src="${esc(s.photo)}" alt="" loading="lazy">` : `<span class="thumb">📍</span>`)}
                    <span class="name">${j + 1}. ${esc(s.name)}</span>
                    ${s.time ? `<span class="t">${esc(s.time)}</span>` : ''}
                  </li>`).join('')}</ol>`
              : '<p class="empty-line">Nenhuma parada neste dia.</p>'}
            <button class="btn sm" data-day="${i}">Abrir dia <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
          </div>
        </article>`;
      }).join('')}
      <button type="button" class="card overview-add" data-act="addDay"><span class="material-symbols-outlined" aria-hidden="true">add</span> Adicionar dia</button>
    </div>`;
}

function renderDayHead(t) {
  const d = t.days[dayIdx];
  $('#dayHead').innerHTML = `
    <div class="dh">
      <input id="dayName" value="${esc(d.name)}" aria-label="Nome do dia">
      <button type="button" class="btn sm ghost recalculate-route" data-act="recalculateRoute" aria-label="Recalcular rota deste dia" title="Recalcular os trajetos deste dia">
        <span class="material-symbols-outlined" aria-hidden="true">alt_route</span><span>Recalcular rota</span>
      </button>
      <button class="btn sm ghost danger" data-act="delDay">Excluir dia</button>
    </div>
    <div class="swatches" style="margin-top:10px">
      ${COLORS.map((c) => `<button class="sw ${c === d.color ? 'on' : ''}" style="background:${c}" data-color="${c}" aria-label="Cor do dia"></button>`).join('')}
    </div>`;
}

function renderSummary(t) {
  const d = t.days[dayIdx];
  const tot = totals([d]);
  $('#summary').innerHTML = `
    <span class="chip">${d.stops.length} ${d.stops.length === 1 ? 'parada' : 'paradas'}</span>
    <span class="chip">No local: ${fmt(tot.visit)}</span>
    <span class="chip">Deslocamento: ${routeTimeLabel(tot)}</span>
    <span class="chip">${routeDistanceLabel(tot)}</span>`;
}

function renderStops(t) {
  const d = t.days[dayIdx];
  const warn = warnings(d);
  const others = (i) => t.days.map((x, j) => j !== i ? `<option value="${j}">${esc(x.name)}</option>` : '').join('');
  $('#stops').innerHTML = d.stops.map((s, i) => `
    <li class="stop" data-id="${s.id}" style="--c:${d.color}">
      ${s.photo
        ? `<div class="stop-photo-wrap">
            <img class="stop-photo" src="${esc(s.photo)}" alt="${esc(s.name)}" loading="lazy">
            ${typeof Offline === 'undefined' || !Offline.isViewOnly()
              ? Array.isArray(s.photoChoices) && s.photoChoices.length > 1
                ? `<div class="stop-photo-nav" aria-label="Alternar foto">
              <button type="button" class="stop-photo-nav-button" data-act="previousPhoto" data-id="${s.id}" aria-label="Foto anterior" title="Foto anterior" ${s.photoIndex ? '' : 'disabled'}>
                <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
              </button>
              <button type="button" class="stop-photo-nav-button" data-act="nextPhoto" data-id="${s.id}" aria-label="Próxima foto" title="Próxima foto" ${s.photoIndex === 1 ? 'disabled' : ''}>
                <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
              </button>
            </div>`
                : !s.photoSearchDone
                  ? `<button type="button" class="stop-photo-search" data-act="searchPhoto" data-id="${s.id}">Buscar outra foto</button>`
                  : ''
              : ''}
            <button type="button" class="stop-photo-action" data-act="icon" data-id="${s.id}" aria-label="Trocar imagem por emoji">
              ${iconEdit === s.id ? 'Escolha um emoji abaixo' : 'Usar emoji'}
            </button>
          </div>`
        : `<div class="stop-photo-emoji-wrap">
            <button type="button" class="stop-photo ph" data-act="icon" data-id="${s.id}" aria-label="Escolher emoji">${esc(s.icon || '📍')}<small>${iconEdit === s.id ? 'escolha abaixo' : 'trocar emoji'}</small></button>
            ${s.originalPhoto ? `<button type="button" class="stop-photo-action" data-act="restorePhoto" data-id="${s.id}" aria-label="Voltar à imagem">Voltar à imagem</button>` : ''}
          </div>`}
      ${iconEdit === s.id ? `<div class="icon-picker"><div class="icon-grid">${ICON_EMOJIS.map((e) => `<button type="button" data-act="pickIcon" data-id="${s.id}" data-v="${esc(e)}" class="${(s.icon || '📍') === e ? 'on' : ''}" aria-label="${esc(e)}">${esc(e)}</button>`).join('')}</div><div class="custom-emoji-row stop-custom-emoji"><input type="text" data-custom-stop-emoji="${s.id}" placeholder="Ou cole um emoji…" aria-label="Emoji personalizado para ${esc(s.name)}"><button type="button" class="btn sm" data-act="pickCustomIcon" data-id="${s.id}">Usar emoji</button></div></div>` : ''}
      <div class="stop-body">
        <div class="sh">
          <span class="num">${i + 1}</span>
          ${stopRenameId === s.id
            ? `<div class="stop-name-edit">
                <input class="stop-name-input" data-stop-name data-id="${s.id}" maxlength="80" value="${esc(s.name)}" aria-label="Nome da parada">
                <button type="button" class="btn sm icon primary stop-name-save" data-act="saveRename" data-id="${s.id}" aria-label="Salvar novo nome" title="Salvar nome"><span class="material-symbols-outlined" aria-hidden="true">check</span></button>
                <button type="button" class="btn sm icon ghost stop-name-cancel" data-act="cancelRename" data-id="${s.id}" aria-label="Cancelar renomeação" title="Cancelar"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
              </div>`
            : `<b>${esc(s.name)}</b>
               <button type="button" class="btn sm icon ghost stop-rename" data-act="rename" data-id="${s.id}" aria-label="Renomear ${esc(s.name)}" title="Renomear ponto turístico"><span class="material-symbols-outlined" aria-hidden="true">edit</span></button>`}
          <button type="button" class="stop-drag-handle" aria-label="Arrastar ${esc(s.name)} para reordenar" title="Arrastar para reordenar">
            <span class="material-symbols-outlined" aria-hidden="true">drag_indicator</span>
          </button>
          <button class="btn sm icon ghost danger" data-act="del" data-id="${s.id}" aria-label="Remover parada"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
        </div>
        <div class="stop-chips">
          ${s.time ? `<span class="chip time">🕒 ${esc(s.time)}</span>` : ''}
          ${typeof Offline !== 'undefined' && Offline.isViewOnly() ? `<span class="chip">⏱ ${s.stay ?? 60} min</span>` : ''}
          ${i > 0 ? `<span class="chip leg">${s.legMin != null ? `${MODES[s.transport || 'walk'].label}: ${Math.round(s.legMin)} min · ${s.legKm.toFixed(1)} km` : 'Trajeto não calculado'}</span>` : ''}
        </div>
        <div class="fields">
          <label>Chegada às<input type="time" data-f="time" data-id="${s.id}" value="${s.time || ''}" aria-label="Horário de chegada"></label>
          <label>Tempo no local (min)<input type="number" min="0" step="5" data-f="stay" data-id="${s.id}" value="${s.stay ?? 60}" aria-label="Tempo de permanência em minutos"></label>
          ${i > 0 ? `<label>Como chegar
            <select data-f="transport" data-id="${s.id}" aria-label="Meio de transporte">
              ${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${k === (s.transport || 'walk') ? 'selected' : ''}>${m.label}</option>`).join('')}
            </select></label>` : ''}
        </div>
        ${warn.has(i) ? `<div class="warn">⚠️ O horário não comporta o deslocamento. Você pode salvar mesmo assim.</div>` : ''}
        ${s.desc ? `<details class="info"><summary>Sobre o lugar</summary>
          <p>${esc(s.desc)}</p>
          <small>Fonte: ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">Wikipédia</a>` : 'Wikipédia'} (CC BY-SA)</small>
        </details>` : ''}
        <div class="mv">
          <select class="mvSel" data-id="${s.id}" aria-label="Mover ${esc(s.name)} para outro dia"><option value="">Mover para outro dia…</option>${others(dayIdx)}</select>
          <button type="button" class="btn sm" data-act="idea" data-id="${s.id}">Mover para ideias</button>
        </div>
      </div>
    </li>`).join('') || `
    <div class="empty" style="padding:28px 16px">
      <div class="big-emoji">📍</div>
      <p>Nenhuma parada neste dia.</p>
      <p class="muted">Busque um lugar abaixo para adicioná-lo.</p>
    </div>`;
}

function renderIdeas(t) {
  $('#ideaCount').textContent = t.ideas.length ? `(${t.ideas.length})` : '';
  $('#ideas').innerHTML = t.ideas.map((p) => `
    <li>
      <span>${esc(p.name)}</span>
      <select aria-label="Escolha em qual dia adicionar ${esc(p.name)}">${t.days.map((d, j) => `<option value="${j}" ${j === dayIdx ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      <button type="button" class="btn sm" data-act="toDay" data-id="${p.id}">Adicionar ao dia</button>
      <button class="btn sm icon ghost danger" data-act="delIdea" data-id="${p.id}" aria-label="Remover ideia"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
    </li>`).join('') || `<li class="empty-line">Sua lista está vazia. Use “Mover para ideias” em uma parada ou “Guardar ideia” nos resultados da busca.</li>`;
}


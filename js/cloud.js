// ---------- nuvem: Supabase + login com Google ----------
// Estratégia: o localStorage continua sendo a cópia usada pelo app (funciona offline).
// Quando há login, cada viagem é enviada ao Supabase quando muda e as viagens da nuvem
// são baixadas. Em conflito, vale a alteração mais recente (última gravação vence).
const Cloud = (() => {
  const META_KEY = 'mundo-afora.cloud';
  let meta = JSON.parse(localStorage.getItem(META_KEY) || 'null') || { owner: null, snap: {}, deleted: [] };
  let sb = null, session = null, timer = null, queue = Promise.resolve();
  let syncing = false; // evita que a própria sincronização dispare outra

  const enabled = () => !!window.supabase && !!CONFIG.SUPABASE_URL && !CONFIG.SUPABASE_URL.includes('SEU-PROJETO')
    && !!CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_ANON_KEY.startsWith('COLE_');
  const persist = () => localStorage.setItem(META_KEY, JSON.stringify(meta));
  const strip = (t) => { const { updatedAt, ...rest } = t; return rest; };
  const snapOf = (t) => JSON.stringify(strip(t));

  function setStatus(state = 'pending') {
    const el = $('#syncStatus');
    if (!el) return;
    if (!session) {
      el.replaceChildren();
      el.className = 'sync-status hidden';
      el.removeAttribute('aria-label');
      el.removeAttribute('title');
      return;
    }
    const synced = state === 'synced';
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = synced ? 'cloud_done' : 'progress_activity';
    el.replaceChildren(icon);
    el.className = `sync-status ${synced ? 'synced' : 'pending'}`;
    el.setAttribute('aria-label', synced ? 'Sincronizado' : 'Sincronização pendente');
    el.title = synced ? 'Sincronizado' : 'Sincronização pendente';
  }
  function renderAuth() {
    const on = !!session;
    const email = $('#accountEmail');
    const authButton = $('#authBtn');
    email.textContent = on ? session.user.email : '';
    email.classList.toggle('hidden', !on);
    authButton.replaceChildren();
    if (on) {
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = 'logout';
      authButton.append(icon);
      authButton.setAttribute('aria-label', 'Sair da conta');
      authButton.title = 'Sair da conta';
    } else {
      authButton.textContent = 'Entrar com Google';
      authButton.setAttribute('aria-label', 'Entrar com Google');
    }
    authButton.classList.toggle('is-signout', on);
    authButton.classList.toggle('is-signin', !on);
    if (on) authButton.title = 'Sair da conta';
    const banner = $('#cloudBanner');
    if (banner) banner.classList.toggle('hidden', on);
    setStatus(on ? 'pending' : '');
  }

  // chamado antes de cada gravação local: marca o que mudou e registra exclusões
  function touch() {
    const now = Date.now();
    db.trips.forEach((t) => { if (meta.snap[t.id] !== snapOf(t)) t.updatedAt = now; });
    if (session) {
      const ids = new Set(db.trips.map((t) => t.id));
      Object.keys(meta.snap).forEach((id) => {
        if (!ids.has(id)) {
          delete meta.snap[id];
          if (!meta.deleted.includes(id)) meta.deleted.push(id);
        }
      });
      persist();
    }
  }
  // agenda o envio logo após a última alteração (evita uma requisição por tecla)
  function changed() {
    if (!session || syncing) return;
    clearTimeout(timer);
    setStatus('pending');
    timer = setTimeout(sync, 900);
  }

  function hasPending() {
    return meta.deleted.length > 0 || db.trips.some((t) => meta.snap[t.id] !== snapOf(t));
  }

  function sync() {
    queue = queue.then(async () => {
      if (!session) return;
      syncing = true;
      setStatus('pending');
      let ok = false;
      try {
        const before = JSON.stringify(db.trips);
        await pull();
        await push();
        persist();
        if (JSON.stringify(db.trips) !== before) refreshUI();
        setStatus('synced');
        ok = true;
      } catch (err) {
        console.error(err);
        setStatus('pending');
      } finally {
        syncing = false;
      }
      // só reenvia se ainda houver alteração real do usuário (sem retentativas em loop)
      if (ok && session && hasPending()) changed();
    });
    return queue;
  }

  async function pull() {
    const { data, error } = await sb.from('trips').select('id, data, updated_at');
    if (error) throw error;
    const remote = new Map(data.map((r) => [r.id, r]));

    // viagens apagadas em outro aparelho somem daqui, desde que não tenham alterações pendentes
    db.trips = db.trips.filter((t) => {
      const gone = meta.snap[t.id] !== undefined && !remote.has(t.id) && meta.snap[t.id] === snapOf(t);
      if (gone) delete meta.snap[t.id];
      return !gone;
    });

    for (const r of remote.values()) {
      if (meta.deleted.includes(r.id)) continue;
      const rTime = Date.parse(r.updated_at);
      const local = db.trips.find((t) => t.id === r.id);
      if (!local) {
        const t = { ...r.data, id: r.id, updatedAt: rTime };
        db.trips.push(t);
        meta.snap[t.id] = snapOf(t);
      } else if (meta.snap[local.id] === snapOf(local) && rTime > (local.updatedAt || 0)) {
        Object.assign(local, r.data, { id: r.id, updatedAt: rTime });
        meta.snap[local.id] = snapOf(local);
      }
    }
    if (db.currentId && !db.trips.some((t) => t.id === db.currentId)) db.currentId = null;
    localStorage.setItem(KEY, JSON.stringify(db));
  }

  async function push() {
    for (const id of [...meta.deleted]) {
      const { error } = await sb.from('trips').delete().eq('id', id);
      if (error) throw error;
      meta.deleted = meta.deleted.filter((x) => x !== id);
    }
    const dirty = db.trips.filter((t) => meta.snap[t.id] !== snapOf(t));
    if (dirty.length) {
      const rows = dirty.map((t) => ({
        id: t.id,
        user_id: session.user.id,
        data: strip(t),
        updated_at: new Date(t.updatedAt || Date.now()).toISOString(),
      }));
      const { error } = await sb.from('trips').upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw error;
      dirty.forEach((t) => { meta.snap[t.id] = snapOf(t); });
    }
  }

  // atualiza a tela sem mexer no diálogo se ele estiver aberto
  function refreshUI() {
    if (!$('#tripDlg').open) syncRouteFromHash();
  }

  async function onSession(s) {
    session = s;
    renderAuth();
    if (!s) return;
    // conta diferente da última usada neste aparelho: tudo local é enviado de novo para a conta atual
    if (meta.owner !== s.user.id) meta = { owner: s.user.id, snap: {}, deleted: [] };
    persist();
    await sync();
  }

  async function signIn() {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) toast('Não foi possível entrar agora. Tente novamente.');
  }
  async function signOut() {
    if (!confirm('Sair da conta? As viagens deste aparelho serão removidas daqui. Elas continuam na nuvem e voltam ao entrar de novo.')) return;
    await sb.auth.signOut();
    db.trips = [];
    db.currentId = null;
    meta = { owner: null, snap: {}, deleted: [] };
    persist();
    localStorage.setItem(KEY, JSON.stringify(db));
    toast('Você saiu da conta.', 'ok');
    goHome();
  }

  function init() {
    if (!enabled()) {
      ['#authBtn', '#accountEmail', '#syncStatus', '.top-actions'].forEach((selector) => $(selector).classList.add('hidden'));
      return;
    }
    sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    });
    sb.auth.onAuthStateChange((event, s) => {
      if (event === 'TOKEN_REFRESHED') { session = s; return; }
      if (event === 'SIGNED_OUT') { onSession(null); return; }
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') onSession(s);
    });
    $('#authBtn').onclick = () => (session ? signOut() : signIn());
    const bannerLogin = $('#bannerLogin');
    if (bannerLogin) bannerLogin.onclick = signIn;
    document.addEventListener('visibilitychange', () => { if (!document.hidden && session) sync(); });
    window.addEventListener('online', () => { if (session) sync(); });
    window.addEventListener('offline', () => { if (session) setStatus('pending'); });
  }

  if (enabled()) {
    $('#authBtn').classList.remove('hidden');
  }
  init();
  return { touch, changed };
})();

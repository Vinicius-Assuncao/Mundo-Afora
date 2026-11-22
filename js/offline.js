// ---------- offline: indicação visual, modo "editar localmente"/"somente leitura" e limites ----------
// - Mostra chip e faixa de aviso quando não há internet.
// - Ao abrir uma viagem hospedada na conta Google estando offline, pergunta se o usuário quer
//   editar localmente (envia ao reconectar) ou apenas visualizar (sem botões de edição).
// - Desativa o que depende de internet (busca de lugares, entrar/sair da conta, cálculo de trajetos).
const Offline = (() => {
  const modes = new Map(); // id da viagem -> 'edit' | 'view' (escolha feita nesta visita)
  const inTrip = () => document.body.classList.contains('in-trip');
  const isOffline = () => !navigator.onLine;
  const isViewOnly = () => {
    const trip = typeof cur === 'function' ? cur() : null;
    return isOffline() && inTrip() && !!trip && modes.get(trip.id) === 'view';
  };

  function bannerText(view) {
    const pending = Cloud.pending();
    const queued = pending ? ` ${pending} ${pending === 1 ? 'alteração será enviada' : 'alterações serão enviadas'} quando a conexão voltar.` : '';
    if (!inTrip()) return `Você está offline. Suas viagens continuam disponíveis neste aparelho.${queued}`;
    if (view) return 'Modo somente leitura: nada pode ser alterado enquanto você estiver offline.';
    if (Cloud.isHosted(cur())) return 'Editando offline: as alterações ficam neste aparelho e serão enviadas para a sua conta quando a internet voltar. Busca de lugares e trajetos novos precisam de conexão.';
    return 'Você está offline. Suas alterações ficam salvas neste aparelho. Busca de lugares e trajetos novos precisam de conexão.';
  }

  // aplica o estado atual (offline, somente leitura) à interface
  function apply() {
    const off = isOffline();
    if (!inTrip() || !off) modes.clear(); // a escolha vale só para a visita atual
    const view = isViewOnly();
    document.body.classList.toggle('is-offline', off);
    document.body.classList.toggle('view-only', view);
    $('#offlineChip').classList.toggle('hidden', !off);
    $('#offlineBar').classList.toggle('hidden', !off);
    $('#offlineText').textContent = off ? bannerText(view) : '';
    // a busca de lugares usa serviços online
    const q = $('#q'), submit = $('#searchForm button[type="submit"]');
    if (!q.dataset.ph) q.dataset.ph = q.placeholder;
    q.disabled = off; submit.disabled = off;
    q.placeholder = off ? 'A busca de lugares precisa de internet' : q.dataset.ph;
    // reordenar por arrastar é edição
    const sortable = typeof Sortable !== 'undefined' && Sortable.get($('#stops'));
    if (sortable) sortable.option('disabled', view);
  }

  function ask(trip) {
    const dlg = $('#offlineDlg');
    $('#offTrip').textContent = trip.name;
    const choose = (mode) => {
      modes.set(trip.id, mode);
      if (dlg.open) dlg.close();
      apply();
      renderTrip();
    };
    $('#offEdit').onclick = () => choose('edit');
    $('#offView').onclick = () => choose('view');
    dlg.oncancel = (e) => { e.preventDefault(); choose('view'); }; // Esc = opção mais segura
    dlg.showModal();
  }

  // chamado a cada renderização da viagem
  function onTripShown(trip) {
    if (trip && isOffline() && Cloud.isHosted(trip) && !modes.has(trip.id) && !$('#offlineDlg').open) ask(trip);
    apply();
  }

  window.addEventListener('offline', () => {
    apply();
    if (inTrip() && cur()) { onTripShown(cur()); renderTrip(); }
  });
  window.addEventListener('online', () => {
    modes.clear();
    const dlg = $('#offlineDlg');
    if (dlg.open) dlg.close();
    apply();
    const pending = Cloud.pending();
    toast(`Conexão restabelecida.${pending ? ' Enviando suas alterações…' : ''}`, 'ok');
    if (inTrip() && cur()) { renderTrip(); ensureWiki(cur()); }
  });
  // imagens que não carregam offline não mostram o ícone de "imagem quebrada"
  document.addEventListener('error', (e) => {
    if (e.target && e.target.tagName === 'IMG') e.target.classList.add('img-failed');
  }, true);

  apply();
  return { isOffline, isViewOnly, onTripShown, apply };
})();

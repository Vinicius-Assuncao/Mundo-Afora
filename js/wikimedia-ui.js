// Interface de créditos do Wikimedia Commons.
// Carregado depois de map.js/events.js para manter o núcleo do app independente.
(() => {
  const safe = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const allStops = () => {
    const trip = typeof cur === 'function' ? cur() : null;
    return trip ? trip.days.flatMap((day) => day.stops) : [];
  };
  const compactCredit = (stop) => {
    const credit = stop?.photoAttribution?.credit || stop?.photoCredit || '';
    return credit.length > 125 ? credit.slice(0, 122) + '…' : credit;
  };
  const attributionHtml = (stop, className = 'photo-credit') => {
    const attribution = stop?.photoAttribution;
    if (!attribution && !stop?.photoCredit) return '';
    const label = compactCredit(stop);
    const href = attribution?.source || '';
    return `<small class="${className}">Foto: ${href
      ? `<a href="${safe(href)}" target="_blank" rel="noopener noreferrer">${safe(label || 'ver atribuição')}</a>`
      : safe(label)}</small>`;
  };

  function addCardCredits() {
    document.querySelectorAll('#stops .stop').forEach((card) => {
      const id = card.dataset.id;
      const stop = allStops().find((item) => item.id === id);
      if (!stop || !stop.photo || !stop.photoAttribution) return;
      const imageWrap = card.querySelector('.stop-photo-wrap');
      if (imageWrap && !imageWrap.querySelector('.photo-credit')) {
        imageWrap.insertAdjacentHTML('beforeend', attributionHtml(stop));
      }
      if (imageWrap && !imageWrap.querySelector('.photo-attribution-details')) {
        const attribution = stop.photoAttribution;
        const detail = document.createElement('details');
        detail.className = 'info photo-attribution-details';
        detail.innerHTML = `<summary>Créditos da fotografia</summary>
          <p>${safe(attribution.author || 'Autor não informado')}${attribution.license ? ` · ${safe(attribution.license)}` : ''}</p>
          ${attribution.description ? `<small>${safe(attribution.description)}</small>` : ''}
          ${attribution.source ? `<small><a href="${safe(attribution.source)}" target="_blank" rel="noopener noreferrer">Ver arquivo original no Wikimedia Commons</a></small>` : ''}
          ${attribution.licenseUrl ? `<small><a href="${safe(attribution.licenseUrl)}" target="_blank" rel="noopener noreferrer">Consultar licença</a></small>` : ''}`;
        imageWrap.appendChild(detail);
      }
    });
  }

  const observer = new MutationObserver(addCardCredits);
  const start = () => {
    const targets = [document.querySelector('#stops'), document.querySelector('#overviewDays')].filter(Boolean);
    targets.forEach((target) => observer.observe(target, { childList: true, subtree: true }));
    addCardCredits();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

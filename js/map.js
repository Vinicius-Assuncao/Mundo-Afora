// ---------- mapa ----------
const MAP_STYLES = {
  osm:    { label: 'Padrão', make: () => tile('https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© OpenStreetMap') },
  light:  { label: 'Limpo', make: () => cartoTile('rastertiles/voyager') },
  dark:   { label: 'Escuro', make: () => cartoTile('dark_all') },
  sat:    { label: 'Satélite', make: () => satImagery() },
  satlab: { label: 'Satélite com nomes', make: () => L.layerGroup([
    satImagery(),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '' }),
  ]) },
};
let activeMapStyle = 'osm';

function isLocalHosting() {
  const hostname = location.hostname.toLowerCase();
  const privateIpv4 = /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  return location.protocol === 'file:'
    || ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(hostname)
    || privateIpv4;
}

const AVAILABLE_MAP_STYLES = Object.fromEntries(
  Object.entries(MAP_STYLES).filter(([id]) => !isLocalHosting() || !['light', 'dark'].includes(id))
);

function tile(url, attribution, subdomains = 'abc') {
  return L.tileLayer(url, { maxZoom: 20, subdomains, attribution });
}
function cartoTile(style) {
  const key = CONFIG.CARTO_KEY ? `?key=${encodeURIComponent(CONFIG.CARTO_KEY)}` : '';
  return L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png${key}`, {
    maxZoom: 20, subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
  });
}
function satImagery() {
  return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics',
  });
}
function initMap() {
  map = L.map('map', { zoomControl: true }).setView([-14.2, -51.9], 4);
  const saved = localStorage.getItem('mundo-afora.map');
  const current = AVAILABLE_MAP_STYLES[saved] ? saved : 'osm';
  activeMapStyle = current;
  const byId = {};
  for (const [id, o] of Object.entries(AVAILABLE_MAP_STYLES)) {
    byId[id] = o.make();
  }
  byId[current].addTo(map);

  const MapStyleControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const container = L.DomUtil.create('div', 'map-style-control');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      container.innerHTML = `
        <button type="button" class="map-style-toggle" aria-expanded="false" aria-label="Escolher estilo do mapa">
          <span class="map-style-icon material-symbols-outlined" aria-hidden="true">map</span>
          <span class="map-style-label">Mapa</span>
          <span class="map-style-chevron material-symbols-outlined" aria-hidden="true">keyboard_arrow_down</span>
        </button>
        <div class="map-style-menu" role="radiogroup" aria-label="Estilo do mapa">
          ${Object.entries(AVAILABLE_MAP_STYLES).map(([id, style]) => `
            <button type="button" class="map-style-option" data-style="${id}" role="radio" aria-checked="false">
              <span class="map-preview ${id}"><span></span></span>
              <span>${esc(style.label)}</span>
            </button>
          `).join('')}
        </div>
      `;

      const toggle = container.querySelector('.map-style-toggle');
      const menu = container.querySelector('.map-style-menu');
      const label = container.querySelector('.map-style-label');

      const update = (id) => {
        container.querySelectorAll('.map-style-option').forEach((button) => {
          const active = button.dataset.style === id;
          button.classList.toggle('active', active);
          button.setAttribute('aria-checked', String(active));
        });
        label.textContent = AVAILABLE_MAP_STYLES[id].label;
      };

      toggle.addEventListener('click', () => {
        const open = container.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });

      container.querySelectorAll('.map-style-option').forEach((button) => {
        button.addEventListener('click', () => {
          const id = button.dataset.style;
          Object.values(byId).forEach((layerItem) => map.removeLayer(layerItem));
          byId[id].addTo(map);
          localStorage.setItem('mundo-afora.map', id);
          activeMapStyle = id;
          update(id);
          if (cur()) drawMap(cur());
          container.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });

      update(current);
      return container;
    },
  });
  new MapStyleControl().addTo(map);

  layer = L.layerGroup().addTo(map);
  window.addEventListener('resize', () => map.invalidateSize());
}

function tipHtml(s, day) {
  const when = day ? `${esc(day.name)}${s.time ? ' · ' + esc(s.time) : ''}` : (s.time ? esc(s.time) : '');
  return `<div class="tip">
    ${s.icon ? `<div class="tip-icon">${esc(s.icon)}</div>` : (s.photo ? `<img src="${esc(s.photo)}" alt="">` : `<div class="tip-icon">📍</div>`)}
    <div class="tip-body"><b>${esc(s.name)}</b>${when ? `<span>${when}</span>` : ''}</div>
  </div>`;
}

function drawMap(t) {
  layer.clearLayers();
  const pts = [];
  const days = overview ? t.days : [t.days[dayIdx]];
  days.filter(Boolean).forEach((d, di) => {
    const dayRealIndex = overview ? t.days.indexOf(d) : dayIdx;
    d.stops.forEach((s, i) => {
      const ll = [s.lat, s.lon];
      pts.push(ll);
      L.marker(ll, {
        icon: L.divIcon({
          className: '',
          html: `<div class="pin" style="background:${d.color}">${i + 1}</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16],
        }),
      })
        .bindTooltip(tipHtml(s, overview ? d : null), { className: 'map-tip', direction: 'top', offset: [0, -18], opacity: 1 })
        .on('click', () => focusStop(dayRealIndex, s.id))
        .addTo(layer);
      if (i > 0) {
        const geo = s.legGeo || [[d.stops[i - 1].lat, d.stops[i - 1].lon], ll];
        const dashed = !s.legGeo;
        const outlineColor = activeMapStyle === 'sat' || activeMapStyle === 'satlab'
          ? 'rgba(15, 24, 28, .78)'
          : activeMapStyle === 'dark' ? '#f0f0f0' : '#ffffff';
        L.polyline(geo, { color: outlineColor, weight: 9, opacity: .9, interactive: false }).addTo(layer);
        L.polyline(geo, { color: d.color, weight: 5, opacity: .98, dashArray: dashed ? '6 8' : null, interactive: false }).addTo(layer);
      }
    });
  });
  if (pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: 15 });
}

// clicar num ponto do mapa leva ao cartão da parada
function focusStop(dayI, stopId) {
  if (dayI !== dayIdx || overview) { dayIdx = dayI; overview = false; renderTrip(); }
  requestAnimationFrame(() => {
    document.querySelectorAll('.stop.hl').forEach((el) => el.classList.remove('hl'));
    const el = document.querySelector(`.stop[data-id="${stopId}"]`);
    if (el) {
      el.classList.add('hl');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}


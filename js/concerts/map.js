// ============================================================
//  CONCERT MAP — Leaflet.js map with city-clustered markers
// ============================================================

let _map = null;
let _markersLayer = null;
let _allEvents = [];
let _dateFilter = null;   // { start: Date, end: Date } or null
let _artistFilter = null; // artist name string or null

function initConcertMap(containerId) {
  _map = L.map(containerId, {
    center: [53.55, 10.0], // Hamburg
    zoom: 5,
    zoomControl: true,
    attributionControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 18
  }).addTo(_map);

  _markersLayer = L.layerGroup().addTo(_map);
  return _map;
}

function setConcertEvents(events) {
  _allEvents = events;
  _renderFiltered();
}

function filterByDates(startDate, endDate) {
  _dateFilter = (startDate && endDate) ? { start: startDate, end: endDate } : null;
  _renderFiltered();
}

function filterByArtist(artistName) {
  _artistFilter = artistName || null;
  _renderFiltered();
}

function _getFilteredEvents() {
  let events = _allEvents;

  if (_dateFilter) {
    events = events.filter(ev => {
      if (!ev.date) return false;
      const d = new Date(ev.date);
      return d >= _dateFilter.start && d <= _dateFilter.end;
    });
  }

  if (_artistFilter) {
    const needle = _artistFilter.toLowerCase();
    events = events.filter(ev => ev.artistName.toLowerCase() === needle);
  }

  return events;
}

// ── City clustering: group events by city within ~0.3° proximity ──
function _clusterByCities(events) {
  const clusters = []; // { city, lat, lng, events[] }

  for (const ev of events) {
    let found = false;
    for (const c of clusters) {
      if (Math.abs(c.lat - ev.lat) < 0.3 && Math.abs(c.lng - ev.lng) < 0.3) {
        c.events.push(ev);
        found = true;
        break;
      }
    }
    if (!found) {
      clusters.push({
        city: ev.city || 'Unknown',
        lat: ev.lat,
        lng: ev.lng,
        events: [ev]
      });
    }
  }

  return clusters;
}

// ── Circle packing: arrange N circles without overlap, packed toward the centre ──
function _packCircles(radii) {
  if (!radii.length) return [];
  const GAP = 3; // px gap between circles
  const placed = [];

  for (let i = 0; i < radii.length; i++) {
    const r = radii[i];
    if (i === 0) { placed.push({ x: 0, y: 0, r }); continue; }

    let bestX = 0, bestY = 0, bestDist = Infinity;
    const STEPS = 72; // probe every 5°

    for (let s = 0; s < STEPS; s++) {
      const a = (s / STEPS) * Math.PI * 2;
      // Binary-search the minimum clearance distance along this ray
      let lo = 0, hi = 500;
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        const cx = Math.cos(a) * mid;
        const cy = Math.sin(a) * mid;
        const hits = placed.some(p => Math.hypot(p.x - cx, p.y - cy) < p.r + r + GAP);
        if (hits) lo = mid; else hi = mid;
      }
      const cx = Math.cos(a) * hi;
      const cy = Math.sin(a) * hi;
      const dist = Math.hypot(cx, cy);
      if (dist < bestDist) { bestDist = dist; bestX = cx; bestY = cy; }
    }

    placed.push({ x: bestX, y: bestY, r });
  }

  return placed;
}

function _renderFiltered() {
  if (!_map || !_markersLayer) return;
  _markersLayer.clearLayers();

  const events = _getFilteredEvents();
  if (events.length === 0) return;

  const clusters = _clusterByCities(events);

  for (const cluster of clusters) {
    // Collect unique artists; propagate festival flag if any event is a festival
    const artistMap = new Map();
    for (const ev of cluster.events) {
      const key = ev.artistName.toLowerCase();
      if (!artistMap.has(key)) {
        artistMap.set(key, { ...ev });
      } else if (ev.isFestival) {
        artistMap.get(key).isFestival = true;
      }
    }

    const artists = [...artistMap.values()]
      .sort((a, b) => b.affinityScore - a.affinityScore)
      .slice(0, 15);

    // Map affinity → radius 8–20 px (diameter 16–40 px)
    const maxAff = artists[0]?.affinityScore || 1;
    const radii  = artists.map(a => {
      const t = maxAff > 0 ? a.affinityScore / maxAff : 0.5;
      return Math.round(8 + t * 12);
    });

    const packed = _packCircles(radii);

    // Bounding box → icon container size + offset so origin (0,0) is inside
    const PAD  = 4;
    const minX = Math.min(...packed.map(c => c.x - c.r));
    const maxX = Math.max(...packed.map(c => c.x + c.r));
    const minY = Math.min(...packed.map(c => c.y - c.r));
    const maxY = Math.max(...packed.map(c => c.y + c.r));
    const W    = Math.ceil(maxX - minX) + PAD * 2;
    const H    = Math.ceil(maxY - minY) + PAD * 2;
    const oX   = -Math.floor(minX) + PAD; // packed (0,0) maps to icon pixel (oX, oY)
    const oY   = -Math.floor(minY) + PAD;

    // Build HTML — one absolutely-positioned bubble per artist
    let html = `<div style="position:relative;width:${W}px;height:${H}px">`;

    for (let i = 0; i < artists.length; i++) {
      const a = artists[i];
      const c = packed[i];
      const d = c.r * 2;
      const l = Math.round(c.x + oX - c.r);
      const t = Math.round(c.y + oY - c.r);
      const fs = Math.max(8, Math.round(c.r * 0.8));

      const inner = a.artistImageUrl
        ? `<img src="${_escAttr(a.artistImageUrl)}" alt="" />`
        : `<span class="marker-initial" style="font-size:${fs}px">${_esc(a.artistName.charAt(0))}</span>`;

      const badge = a.isFestival
        ? `<span class="marker-festival-badge" title="Festival">F</span>` : '';

      html +=
        `<div class="concert-bubble-wrap" ` +
          `style="left:${l}px;top:${t}px;width:${d}px;height:${d}px;z-index:${artists.length - i}" ` +
          `title="${_escAttr(a.artistName)}">` +
          `<div class="concert-bubble">${inner}</div>` +
          badge +
        `</div>`;
    }

    html += '</div>';

    const icon = L.divIcon({
      html,
      className: 'concert-cluster-wrapper',
      iconSize:   [W, H],
      iconAnchor: [oX, oY]
    });

    const marker = L.marker([cluster.lat, cluster.lng], { icon });
    marker.bindPopup(_buildPopup(cluster.city, cluster.events), {
      maxWidth: 320,
      className: 'concert-popup'
    });
    _markersLayer.addLayer(marker);
  }

  // Fit map to all clusters
  if (clusters.length > 0) {
    const bounds = clusters.map(c => [c.lat, c.lng]);
    _map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }
}

function _buildPopup(cityName, events) {
  // Group events by artist
  const byArtist = new Map();
  for (const ev of events) {
    const key = ev.artistName;
    if (!byArtist.has(key)) byArtist.set(key, []);
    byArtist.get(key).push(ev);
  }

  // Sort artists by affinity
  const sortedArtists = [...byArtist.entries()]
    .sort((a, b) => {
      const scoreA = Math.max(...a[1].map(e => e.affinityScore));
      const scoreB = Math.max(...b[1].map(e => e.affinityScore));
      return scoreB - scoreA;
    });

  let html = `<div class="popup-header">${_esc(cityName)}</div><div class="popup-events">`;

  for (const [artist, artistEvents] of sortedArtists) {
    const img = artistEvents[0].artistImageUrl;
    const imgTag = img
      ? `<img class="popup-artist-img" src="${_escAttr(img)}" alt="" />`
      : `<div class="popup-artist-img popup-artist-initial">${artist.charAt(0)}</div>`;

    html += `<div class="popup-artist">
      ${imgTag}
      <div class="popup-artist-info">
        <div class="popup-artist-name">${_esc(artist)}</div>`;

    for (const ev of artistEvents.slice(0, 5)) {
      const dateStr = ev.date ? _formatDate(ev.date) : 'TBA';
      const venue = ev.venueName ? _esc(ev.venueName) : '';
      const ticketLink = ev.url
        ? `<a class="popup-ticket-link" href="${_escAttr(ev.url)}" target="_blank" rel="noopener">🎟</a>`
        : '';
      html += `<div class="popup-event-row">
        <span class="popup-date">${dateStr}</span>
        <span class="popup-venue">${venue}</span>
        ${ticketLink}
      </div>`;
    }
    if (artistEvents.length > 5) {
      html += `<div class="popup-more">+${artistEvents.length - 5} more</div>`;
    }

    html += `</div></div>`;
  }

  html += '</div>';
  return html;
}

function _formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr.slice(0, 10);
  }
}

function _esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function _escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function invalidateMapSize() {
  if (_map) _map.invalidateSize();
}

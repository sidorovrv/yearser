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

function _renderFiltered() {
  if (!_map || !_markersLayer) return;
  _markersLayer.clearLayers();

  const events = _getFilteredEvents();
  if (events.length === 0) return;

  const clusters = _clusterByCities(events);

  for (const cluster of clusters) {
    // Deduplicate artists in cluster, keep top 10 by affinity
    const artistEventsMap = new Map();
    for (const ev of cluster.events) {
      const key = ev.artistName.toLowerCase();
      if (!artistEventsMap.has(key)) {
        artistEventsMap.set(key, { ...ev, eventCount: 1 });
      } else {
        artistEventsMap.get(key).eventCount++;
      }
    }

    const artistEntries = [...artistEventsMap.values()]
      .sort((a, b) => b.affinityScore - a.affinityScore)
      .slice(0, 10);

    const topArtist = artistEntries[0];
    const maxAffinity = topArtist.affinityScore;

    // Marker size: 14px (low affinity) to 44px (max affinity)
    const markerSize = Math.round(14 + maxAffinity * 30);

    // Create marker with artist avatar
    const hasImage = topArtist.artistImageUrl;
    const iconHtml = hasImage
      ? `<div class="concert-marker" style="width:${markerSize}px;height:${markerSize}px">
           <img src="${_escAttr(topArtist.artistImageUrl)}" alt="" />
           ${artistEntries.length > 1 ? `<span class="marker-count">+${artistEntries.length - 1}</span>` : ''}
         </div>`
      : `<div class="concert-marker concert-marker-no-img" style="width:${markerSize}px;height:${markerSize}px">
           <span class="marker-initial">${topArtist.artistName.charAt(0)}</span>
           ${artistEntries.length > 1 ? `<span class="marker-count">+${artistEntries.length - 1}</span>` : ''}
         </div>`;

    const icon = L.divIcon({
      html: iconHtml,
      className: 'concert-marker-wrapper',
      iconSize: [markerSize, markerSize],
      iconAnchor: [markerSize / 2, markerSize / 2]
    });

    const marker = L.marker([cluster.lat, cluster.lng], { icon });

    // Build popup
    const popupContent = _buildPopup(cluster.city, cluster.events);
    marker.bindPopup(popupContent, {
      maxWidth: 320,
      maxHeight: 360,
      className: 'concert-popup'
    });

    _markersLayer.addLayer(marker);
  }

  // Fit bounds if we have markers
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

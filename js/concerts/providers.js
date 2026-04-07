// ============================================================
//  CONCERT PROVIDERS — abstraction + Ticketmaster & Bandsintown
// ============================================================

/**
 * ConcertEvent shape:
 * {
 *   id, artistName, artistImageUrl, affinityScore,
 *   venueName, city, country, countryCode,
 *   lat, lng, date (ISO string),
 *   url (ticket link), provider ('ticketmaster'|'bandsintown')
 * }
 */

let _activeProviders = ['ticketmaster', 'bandsintown'];

function setActiveProviders(providerNames) {
  _activeProviders = providerNames;
}

function getActiveProviders() {
  return [..._activeProviders];
}

// ── Helpers ──
function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function _fetchWithRetry(url, opts = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    let res;
    try {
      res = await fetch(url, opts);
    } catch {
      if (i === retries) return null;
      await _delay(500);
      continue;
    }
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') || '2', 10) * 1000;
      await _delay(Math.min(wait, 5000));
      continue;
    }
    if (!res.ok) return null;
    return res.json().catch(() => null);
  }
  return null;
}

// ============================================================
//  TICKETMASTER — one global query per artist, filter countries client-side.
//  This reduces N_artists × N_countries calls → N_artists calls.
// ============================================================
async function _fetchTicketmasterEvents(artistName, countryCodes) {
  const key = TICKETMASTER_API_KEY;
  if (!key || key === ('__TICKETMASTER' + '_API_KEY__')) return [];

  const ccSet = new Set(countryCodes.map(c => c.toUpperCase()));

  const params = new URLSearchParams({
    keyword: artistName,
    classificationName: 'music',
    size: '50',
    sort: 'date,asc',
    apikey: key
  });

  const data = await _fetchWithRetry(`${TICKETMASTER_BASE}/events.json?${params}`);
  if (!data?._embedded?.events) return [];

  const events = [];
  for (const ev of data._embedded.events) {
    const venue = ev._embedded?.venues?.[0];
    if (!venue?.location?.latitude || !venue?.location?.longitude) continue;

    const evCC = (venue.country?.countryCode || '').toUpperCase();
    if (!ccSet.has(evCC)) continue; // client-side country filter

    events.push({
      id: ev.id,
      artistName,
      artistImageUrl: '',
      affinityScore: 0,
      venueName: venue.name || '',
      city: venue.city?.name || '',
      country: venue.country?.name || '',
      countryCode: evCC,
      lat: parseFloat(venue.location.latitude),
      lng: parseFloat(venue.location.longitude),
      date: ev.dates?.start?.dateTime || ev.dates?.start?.localDate || '',
      url: ev.url || '',
      provider: 'ticketmaster'
    });
  }
  return events;
}

// ============================================================
//  BANDSINTOWN
// ============================================================
async function _fetchBandsintownEvents(artistName, countryCodes) {
  const appId = BANDSINTOWN_APP_ID;
  if (!appId || appId === ('__BANDSINTOWN' + '_APP_ID__')) return [];

  const encoded = encodeURIComponent(artistName);
  const data = await _fetchWithRetry(
    `${BANDSINTOWN_BASE}/artists/${encoded}/events?app_id=${encodeURIComponent(appId)}&date=upcoming`
  );
  if (!data || !Array.isArray(data)) return [];

  const ccSet = new Set(countryCodes.map(c => c.toUpperCase()));

  return data
    .filter(ev => {
      const evCC = (ev.venue?.country || '').toUpperCase();
      return ccSet.has(evCC);
    })
    .map(ev => ({
      id: `bit-${ev.id}`,
      artistName,
      artistImageUrl: '',
      affinityScore: 0,
      venueName: ev.venue?.name || '',
      city: ev.venue?.city || '',
      country: ev.venue?.country || '',
      countryCode: (ev.venue?.country || '').toUpperCase(),
      lat: parseFloat(ev.venue?.latitude) || 0,
      lng: parseFloat(ev.venue?.longitude) || 0,
      date: ev.datetime || '',
      url: ev.url || '',
      provider: 'bandsintown'
    }))
    .filter(ev => ev.lat !== 0 && ev.lng !== 0);
}

// ============================================================
//  PROVIDER DISPATCH
// ============================================================
async function fetchEventsForArtist(artistName, countryCodes) {
  const results = [];

  const fetchers = {
    ticketmaster: _fetchTicketmasterEvents,
    bandsintown: _fetchBandsintownEvents
  };

  await Promise.all(
    _activeProviders.map(async p => {
      const fn = fetchers[p];
      if (!fn) return;
      try {
        const events = await fn(artistName, countryCodes);
        results.push(...events);
      } catch (e) {
        console.warn(`Provider ${p} failed for "${artistName}":`, e);
      }
    })
  );

  return results;
}

// ============================================================
//  ORCHESTRATOR — fetch events for all artists with concurrency control
// ============================================================
async function fetchAllEvents(affinityMap, countryCodes, onProgress) {
  const artists = [...affinityMap.values()];
  const allEvents = [];
  const concurrency = 3;
  const staggerMs = 250; // gap between batches to respect rate limits
  let completed = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < artists.length; i += concurrency) {
    const batch = artists.slice(i, i + concurrency);

    if (onProgress) {
      onProgress(`Searching concerts… ${completed}/${artists.length} artists`);
    }

    const batchResults = await Promise.all(
      batch.map(artist =>
        fetchEventsForArtist(artist.name, countryCodes)
          .then(events => {
            // Attach affinity data
            events.forEach(ev => {
              ev.artistImageUrl = artist.imageUrl;
              ev.affinityScore = artist.score;
            });
            return events;
          })
          .catch(e => {
            console.warn(`Failed to fetch events for "${artist.name}":`, e);
            return [];
          })
      )
    );

    batchResults.forEach(events => allEvents.push(...events));
    completed += batch.length;

    if (i + concurrency < artists.length) {
      await _delay(staggerMs);
    }
  }

  // Deduplicate by (artistName + city + date)
  const seen = new Set();
  const deduped = [];
  for (const ev of allEvents) {
    const dateStr = ev.date ? ev.date.slice(0, 10) : '';
    const key = `${ev.artistName.toLowerCase()}|${ev.city.toLowerCase()}|${dateStr}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(ev);
    }
  }

  return deduped;
}

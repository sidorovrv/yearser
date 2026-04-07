// ============================================================
//  CONCERTS CACHE — localStorage with TTL and fingerprint validation
// ============================================================

const _CACHE_KEY = 'timelinefm_concerts_v1';

/**
 * Save events to cache.
 * @param {ConcertEvent[]} events
 * @param {string[]} countries  - country codes that were scanned
 * @param {string[]} artistIds  - all artist IDs that were scanned (fingerprint uses first 20)
 */
function saveConcertsCache(events, countries, artistIds) {
  const payload = {
    savedAt:    Date.now(),
    countryKey: [...countries].sort().join(','),
    artistKey:  artistIds.slice(0, 20).join(','),
    events
  };
  try {
    localStorage.setItem(_CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('concerts cache: could not save (storage full?)', e);
  }
}

/**
 * Load cache if it is fresh enough and fingerprint matches.
 * Returns the cache payload, or null if invalid/missing/stale.
 */
function loadConcertsCache(countries, topArtistIds, maxAgeDays) {
  const raw = _loadRawCache();
  if (!raw) return null;
  if (Date.now() - raw.savedAt > maxAgeDays * 86400000) return null;
  if (!_fingerprintMatch(raw, countries, topArtistIds)) return null;
  return raw;
}

/**
 * Load any existing cache entry regardless of age or fingerprint.
 * Used to offer "use stale data" option in preflight.
 */
function loadStaleConcertsCache(countries, topArtistIds) {
  const raw = _loadRawCache();
  if (!raw) return null;
  // Always return if fingerprint matches, even if expired
  if (!_fingerprintMatch(raw, countries, topArtistIds)) return null;
  return raw;
}

function clearConcertsCache() {
  localStorage.removeItem(_CACHE_KEY);
}

function cacheAgeLabel(savedAt) {
  const ms = Date.now() - savedAt;
  const h  = Math.floor(ms / 3600000);
  if (h < 1)  return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

// ── Internals ──

function _loadRawCache() {
  try {
    const raw = localStorage.getItem(_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.savedAt || !Array.isArray(data.events)) return null;
    return data;
  } catch { return null; }
}

function _fingerprintMatch(data, countries, topArtistIds) {
  const ck = [...countries].sort().join(',');
  const ak = topArtistIds.slice(0, 20).join(',');
  return data.countryKey === ck && data.artistKey === ak;
}

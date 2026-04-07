// ============================================================
//  LISTENING HISTORY — fetch Spotify data & compute artist affinity
// ============================================================

/**
 * Returns: Map<spotifyArtistId, ArtistAffinity>
 *   ArtistAffinity = { name, spotifyId, imageUrl, score (0-1),
 *                      genres, popularity (0-100), followers }
 *
 * Strategy:
 *  - New artists are only added from /me/top/artists (full objects with images/stats).
 *  - Recently played and liked songs only boost the rawScore for already-known artists.
 *  - This avoids extra batch-fetch calls and keeps artist data rich.
 */
async function fetchListeningHistory(onProgress) {
  const artistMap = new Map();

  function upsertArtist(artist, weight, isFullObject) {
    if (!artist?.id) return;
    const existing = artistMap.get(artist.id);
    if (existing) {
      existing.rawScore += weight;
      // Upgrade with richer data if available
      if (isFullObject) {
        if (!existing.imageUrl && artist.images?.length)   existing.imageUrl   = artist.images[0].url;
        if (!existing.genres.length && artist.genres?.length) existing.genres = artist.genres;
        if (!existing.popularity && artist.popularity)    existing.popularity = artist.popularity;
        if (!existing.followers && artist.followers?.total) existing.followers = artist.followers.total;
      }
    } else if (isFullObject) {
      // Only create new entries from full top-artist objects
      artistMap.set(artist.id, {
        name:       artist.name,
        spotifyId:  artist.id,
        imageUrl:   artist.images?.[0]?.url || '',
        rawScore:   weight,
        genres:     artist.genres    || [],
        popularity: artist.popularity          || 0,
        followers:  artist.followers?.total    || 0
      });
    }
    // Partial objects (recently played, liked) silently ignored if artist not already known
  }

  // ── Top Artists across 3 time ranges ──
  if (onProgress) onProgress('Fetching your top artists…');

  const timeRanges = [
    { range: 'short_term',  weight: 2.0 },
    { range: 'medium_term', weight: 1.5 },
    { range: 'long_term',   weight: 1.0 }
  ];

  const topResults = await Promise.all(
    timeRanges.map(({ range }) =>
      spotifyFetch(`/me/top/artists?time_range=${range}&limit=50`)
    )
  );

  topResults.forEach((res, i) => {
    if (!res?.items) return;
    const { weight } = timeRanges[i];
    res.items.forEach((artist, rank) => {
      // Higher rank = lower index = higher bonus
      const positionBonus = (50 - rank) / 50;
      upsertArtist(artist, weight * positionBonus, true);
    });
  });

  // ── Recently Played — boost existing artists only ──
  if (onProgress) onProgress('Scanning recently played…');

  const recent = await spotifyFetch('/me/player/recently-played?limit=50');
  if (recent?.items) {
    const counts = {};
    recent.items.forEach(item =>
      item.track?.artists.forEach(a => { counts[a.id] = (counts[a.id] || 0) + 1; })
    );
    for (const [id, count] of Object.entries(counts)) {
      if (artistMap.has(id)) artistMap.get(id).rawScore += count * 0.3;
    }
  }

  // ── Liked Songs — boost existing artists only ──
  if (onProgress) onProgress('Checking liked songs…');

  const liked = await spotifyFetch('/me/tracks?limit=50');
  if (liked?.items) {
    liked.items.forEach(item =>
      item.track?.artists.forEach(a => {
        if (artistMap.has(a.id)) artistMap.get(a.id).rawScore += 0.5;
      })
    );
  }

  // ── Normalize and cap at 100 ──
  let maxScore = 0;
  for (const a of artistMap.values()) if (a.rawScore > maxScore) maxScore = a.rawScore;
  if (maxScore === 0) maxScore = 1;

  const sorted = [...artistMap.values()].sort((a, b) => b.rawScore - a.rawScore);
  const results = new Map();

  sorted.slice(0, 100).forEach(a => {
    results.set(a.spotifyId, {
      name:       a.name,
      spotifyId:  a.spotifyId,
      imageUrl:   a.imageUrl,
      score:      a.rawScore / maxScore,
      genres:     a.genres,
      popularity: a.popularity || 0,
      followers:  a.followers  || 0
    });
  });

  return results;
}

// ============================================================
//  LISTENING HISTORY — fetch Spotify data & compute artist affinity
// ============================================================

/**
 * Fetches the user's listening history from multiple Spotify endpoints
 * and computes a normalized affinity score (0–1) for each artist.
 *
 * Returns: Map<spotifyArtistId, ArtistAffinity>
 *   ArtistAffinity = { name, spotifyId, imageUrl, score, genres }
 */
async function fetchListeningHistory(onProgress) {
  const artistMap = new Map(); // spotifyId → { name, spotifyId, imageUrl, rawScore, genres }

  function upsertArtist(artist, weight) {
    if (!artist || !artist.id) return;
    const existing = artistMap.get(artist.id);
    if (existing) {
      existing.rawScore += weight;
    } else {
      artistMap.set(artist.id, {
        name: artist.name,
        spotifyId: artist.id,
        imageUrl: (artist.images && artist.images.length) ? artist.images[0].url : '',
        rawScore: weight,
        genres: artist.genres || []
      });
    }
  }

  // ── Top Artists (3 time ranges, position-weighted) ──
  const timeRanges = [
    { range: 'short_term', weight: 2.0 },
    { range: 'medium_term', weight: 1.5 },
    { range: 'long_term', weight: 1.0 }
  ];

  if (onProgress) onProgress('Fetching your top artists…');

  const topResults = await Promise.all(
    timeRanges.map(({ range }) =>
      spotifyFetch(`/me/top/artists?time_range=${range}&limit=50`)
    )
  );

  topResults.forEach((res, i) => {
    if (!res || !res.items) return;
    const { weight } = timeRanges[i];
    res.items.forEach((artist, rank) => {
      // Higher rank (lower index) → higher weight
      const positionBonus = (50 - rank) / 50;
      upsertArtist(artist, weight * positionBonus);
    });
  });

  // ── Recently Played Tracks ──
  if (onProgress) onProgress('Scanning recently played tracks…');

  const recent = await spotifyFetch('/me/player/recently-played?limit=50');
  if (recent && recent.items) {
    // Count play frequency per artist
    const playCounts = {};
    recent.items.forEach(item => {
      if (!item.track) return;
      item.track.artists.forEach(a => {
        playCounts[a.id] = (playCounts[a.id] || 0) + 1;
      });
    });
    // For recently played we don't have full artist objects (no images/genres),
    // so we'll just add weight for artists we already know or add minimal entries
    for (const [artistId, count] of Object.entries(playCounts)) {
      const existing = artistMap.get(artistId);
      if (existing) {
        existing.rawScore += count * 0.3;
      } else {
        // Find the artist object from the recent items
        const trackItem = recent.items.find(i =>
          i.track && i.track.artists.some(a => a.id === artistId)
        );
        const artistObj = trackItem?.track.artists.find(a => a.id === artistId);
        if (artistObj) {
          artistMap.set(artistId, {
            name: artistObj.name,
            spotifyId: artistId,
            imageUrl: '',
            rawScore: count * 0.3,
            genres: []
          });
        }
      }
    }
  }

  // ── Liked Songs (sample) ──
  if (onProgress) onProgress('Checking your liked songs…');

  const liked = await spotifyFetch('/me/tracks?limit=50');
  if (liked && liked.items) {
    liked.items.forEach(item => {
      if (!item.track) return;
      item.track.artists.forEach(a => {
        const existing = artistMap.get(a.id);
        if (existing) {
          existing.rawScore += 0.5;
        } else {
          artistMap.set(a.id, {
            name: a.name,
            spotifyId: a.id,
            imageUrl: '',
            rawScore: 0.5,
            genres: []
          });
        }
      });
    });
  }

  // ── Normalize scores to 0–1 ──
  let maxScore = 0;
  for (const a of artistMap.values()) {
    if (a.rawScore > maxScore) maxScore = a.rawScore;
  }
  if (maxScore === 0) maxScore = 1;

  const results = new Map();
  const sorted = [...artistMap.values()].sort((a, b) => b.rawScore - a.rawScore);

  // Cap at top 50 artists to stay within API rate limits
  const top = sorted.slice(0, 50);
  top.forEach(a => {
    results.set(a.spotifyId, {
      name: a.name,
      spotifyId: a.spotifyId,
      imageUrl: a.imageUrl,
      score: a.rawScore / maxScore,
      genres: a.genres
    });
  });

  // ── Fill missing images for artists that only appeared in recent/liked ──
  const missingImages = [...results.values()].filter(a => !a.imageUrl);
  if (missingImages.length > 0 && missingImages.length <= 20) {
    if (onProgress) onProgress('Loading artist images…');
    const ids = missingImages.map(a => a.spotifyId).join(',');
    const full = await spotifyFetch(`/artists?ids=${ids}`);
    if (full && full.artists) {
      full.artists.forEach(fa => {
        if (!fa) return;
        const entry = results.get(fa.id);
        if (entry && fa.images && fa.images.length) {
          entry.imageUrl = fa.images[0].url;
        }
        if (entry && fa.genres && fa.genres.length && !entry.genres.length) {
          entry.genres = fa.genres;
        }
      });
    }
  }

  return results;
}

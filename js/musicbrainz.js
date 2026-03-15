// ============================================================
//  MUSICBRAINZ ISRC YEAR ENRICHMENT
// ============================================================
async function mbLookup(isrc) {
  try {
    const res = await fetch(
      `https://musicbrainz.org/ws/2/recording?isrc=${encodeURIComponent(isrc)}&inc=releases&fmt=json`,
      { headers: { 'User-Agent': 'TimelineFM/1.0 (game)' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const years = [];
    for (const rec of (data.recordings || [])) {
      for (const rel of (rec.releases || [])) {
        if (rel.date) {
          const y = parseInt(rel.date.substring(0, 4));
          if (y >= 1900 && y <= 2025) years.push(y);
        }
      }
    }
    return years.length ? Math.min(...years) : null;
  } catch { return null; }
}

async function enrichYearsFromMusicBrainz(cards) {
  // Process in batches of 5 to avoid hammering the free API
  const BATCH = 5;
  const DELAY = 350; // ms between batches (MusicBrainz rate limit: 1 req/s per IP)
  for (let i = 0; i < cards.length; i += BATCH) {
    const batch = cards.slice(i, i + BATCH);
    await Promise.all(batch.map(async card => {
      if (!card.isrc) return;
      const mbYear = await mbLookup(card.isrc);
      if (mbYear !== null) card.year = mbYear;
    }));
    if (i + BATCH < cards.length) await new Promise(r => setTimeout(r, DELAY));
  }
}

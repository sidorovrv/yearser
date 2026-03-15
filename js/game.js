// ============================================================
//  SKIP UNAVAILABLE TRACK (called from playback.js)
// ============================================================
function skipUnavailableTrack() {
  gameCards.splice(gameIndex, 1);
  if (gameIndex >= gameCards.length) { endGame(); return; }
  loadCard();
}

// ============================================================
//  MODE & TOKENS
// ============================================================
function setMode(m) {
  gameMode = m;
  document.getElementById('mode-standard').classList.toggle('active', m === 'standard');
  document.getElementById('mode-hardcore').classList.toggle('active', m === 'hardcore');
  document.getElementById('mode-four-options').classList.toggle('active', m === 'four-options');
  document.getElementById('mode-name-guess').classList.toggle('active', m === 'name-guess');
  const labels = {
    'standard': '♟ Play Standard',
    'hardcore': '☠ Play Hardcore',
    'four-options': '🎲 Play 4 Options',
    'name-guess': '🎤 Play Name Guess'
  };
  document.getElementById('start-btn').textContent = labels[m] || '▶ Play';
}

// ============================================================
//  GAME — SETUP
// ============================================================
async function startGame() {
  if (!selectedPlaylistId) { alert('Please select a playlist.'); return; }
  stopPlayback();
  goTo('loading');
  document.getElementById('loading-spinner').style.display = '';
  document.getElementById('loading-text').style.display = '';
  document.getElementById('loading-error').style.display = 'none';
  document.getElementById('loading-text').textContent = 'Loading tracks…';

  // Fetch all tracks from playlist (or Liked Songs)
  const isLikedPlaylist = selectedPlaylistId === '__liked__';
  let tracks = [];
  let url = isLikedPlaylist
    ? '/me/tracks?limit=50&fields=next,items(track(id,name,uri,external_ids,album(release_date,images),artists(name)))'
    : `/playlists/${selectedPlaylistId}/tracks?limit=100&fields=next,items(track(id,name,uri,external_ids,album(release_date,images),artists(name)))`;
  while (url) {
    const data = await spotifyFetch(url);
    if (!data) break;
    const valid = (data.items || [])
      .filter(i => i.track && i.track.uri && i.track.album && i.track.album.release_date)
      .map(i => {
        const year = parseInt(i.track.album.release_date.substring(0, 4));
        return {
          id: i.track.id,
          uri: i.track.uri,
          title: i.track.name,
          artist: i.track.artists.map(a => a.name).join(', '),
          year,
          albumArt: i.track.album.images[0] ? i.track.album.images[0].url : null,
          isrc: (i.track.external_ids && i.track.external_ids.isrc) || null
        };
      })
      .filter(t => t.year >= 1900 && t.year <= 2025);
    tracks = tracks.concat(valid);
    url = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
  }

  if (tracks.length < 3) {
    alert('Not enough valid tracks with release dates in this playlist (need at least 3). Try another playlist.');
    goTo('picker');
    return;
  }

  // Fisher-Yates shuffle for uniform randomness
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }
  const poolSize = Math.min(parseInt(document.getElementById('num-pool').value) || 50, tracks.length);
  winTarget = Math.min(parseInt(document.getElementById('num-win').value) || 20, poolSize - 1);
  gameCards = tracks.slice(0, poolSize);

  gameIndex = 0;
  gameScore = 0;
  gameTimeline = [];
  pendingPlacementIndex = null;
  pendingArtistGuess = null;
  pendingTitleGuess = null;
  lastCard = null;
  tokens = 3;
  tokensEarned = 0;
  tokensSpent = 0;

  // Enrich the anchor card's year before placing it
  if (gameCards[0].isrc) {
    gameCards[0].mbChecked = true;
    const mbYear = await mbLookup(gameCards[0].isrc);
    if (mbYear !== null) gameCards[0].year = mbYear;
  }
  // Auto-place the first card as a visible reference point (not needed for name-guess)
  if (gameMode !== 'name-guess') {
    gameTimeline.push({...gameCards[0]});
    gameIndex = 1;
  } else {
    gameIndex = 0;
  }

  document.getElementById('g-pl-name').textContent = selectedPlaylistName;
  // Hide timeline section for name-guess mode — no ordering needed
  const tlSection = document.querySelector('.timeline-section');
  const divider = document.querySelector('.divider');
  if (tlSection) tlSection.style.display = gameMode === 'name-guess' ? 'none' : '';
  if (divider) divider.style.display = gameMode === 'name-guess' ? 'none' : '';
  updateScore();
  updateTokenDisplay();
  goTo('game');
  await loadCard();
}

// ============================================================
//  GAME — CARD LOGIC
// ============================================================
async function loadCard() {
  if (gameIndex >= gameCards.length) { endGame(); return; }
  const card = gameCards[gameIndex];
  // Lazy MusicBrainz year correction — done once per card just before it's shown
  if (card.isrc && !card.mbChecked) {
    card.mbChecked = true;
    const mbYear = await mbLookup(card.isrc);
    if (mbYear !== null) card.year = mbYear;
  }
  pendingPlacementIndex = null;
  pendingArtistGuess = null;
  pendingTitleGuess = null;
  isPlaying = false;
  updateTokenDisplay();

  // Counter
  const counter = document.getElementById('g-counter');
  counter.textContent = `${gameIndex}/${gameCards.length - 1}`;
  counter.style.color = gameMode === 'hardcore' ? 'var(--red)' : '';

  // Obscure all song info until the player locks in their guess
  const titleEl = document.getElementById('g-title');
  titleEl.textContent = '• • • • •';
  titleEl.style.opacity = '0.25';
  const artistEl = document.getElementById('g-artist');
  artistEl.textContent = '• • •';
  artistEl.style.opacity = '0.2';
  document.getElementById('g-year').classList.add('hidden');

  const disc = document.getElementById('vinyl-disc');
  disc.classList.add('hidden-label');
  disc.classList.remove('spinning', 'playing');
  document.getElementById('lbl-title').textContent = '?';
  document.getElementById('lbl-year').textContent = '????';
  document.getElementById('vinyl-wrap').style.display = '';

  const art = document.getElementById('album-art');
  art.classList.remove('visible');
  if (card.albumArt) { art.src = card.albumArt; }
  const revArt = document.getElementById('revealed-art');
  revArt.style.display = 'none';
  revArt.src = '';

  document.getElementById('result-banner').className = 'result-banner';
  document.getElementById('player-status').textContent = 'Ready to play';
  document.getElementById('play-btn').textContent = '▶';
  document.getElementById('play-btn').disabled = false;

  currentTrackUri = card.uri;
  playTrack(card.uri);

  if (gameMode === 'four-options') {
    setControls('four-options', card);
  } else if (gameMode === 'name-guess') {
    setControls('name-guess');
  } else {
    setControls('place-hint');
  }
  renderTimeline(true);
}

function tentativePlaceCard(insertIndex) {
  if (gameMode === 'four-options' || gameMode === 'name-guess') return;
  if (gameMode === 'standard') {
    const ae = document.getElementById('ac-artist');
    const te = document.getElementById('ac-title');
    if (ae) pendingArtistGuess = ae.value;
    if (te) pendingTitleGuess = te.value;
  }
  pendingPlacementIndex = insertIndex;
  setControls('confirm');
  renderTimeline(true);
}

function confirmPlacement() {
  if (pendingPlacementIndex === null) return;
  // Capture latest input values before rebuilding UI
  if (gameMode === 'standard') {
    const ae = document.getElementById('ac-artist');
    const te = document.getElementById('ac-title');
    if (ae) pendingArtistGuess = ae.value;
    if (te) pendingTitleGuess = te.value;
  }
  const card = gameCards[gameIndex];
  const sorted = getSorted();
  const insertIndex = pendingPlacementIndex;

  const prev = insertIndex > 0 ? sorted[insertIndex - 1] : null;
  const next = insertIndex < sorted.length ? sorted[insertIndex] : null;
  const correct = !(prev && card.year < prev.year) && !(next && card.year > next.year);

  // Reveal all song info
  const titleEl = document.getElementById('g-title');
  titleEl.textContent = card.title;
  titleEl.style.opacity = '';
  const artistEl = document.getElementById('g-artist');
  artistEl.textContent = card.artist;
  artistEl.style.opacity = '';
  document.getElementById('g-year').textContent = card.year;
  document.getElementById('g-year').classList.remove('hidden');
  document.getElementById('album-art').classList.add('visible');
  const revArt = document.getElementById('revealed-art');
  if (card.albumArt) { revArt.src = card.albumArt; revArt.style.display = ''; }

  // Hide the vinyl disc — show only the album art once locked in
  document.getElementById('vinyl-wrap').style.display = 'none';

  pendingPlacementIndex = null;

  // Check name bonus (standard only: both artist AND title must be correct)
  const guessAttempted = gameMode === 'standard' && !!(pendingArtistGuess || pendingTitleGuess);
  let nameBonus = false;
  if (gameMode === 'standard' && pendingArtistGuess && pendingTitleGuess) {
    const cardArtists = card.artist.toLowerCase().split(/,\s*/);
    const artistOk = cardArtists.some(a => a === pendingArtistGuess.trim().toLowerCase());
    const titleOk = pendingTitleGuess.trim().toLowerCase() === card.title.toLowerCase();
    if (artistOk && titleOk) {
      nameBonus = true;
      tokens++;
      tokensEarned++;
    }
  }
  const guessFeedback = !guessAttempted ? '' : nameBonus ? ' · +♥ Guess correct!' : ' · Guess wrong';
  pendingArtistGuess = null;
  pendingTitleGuess = null;

  if (correct) {
    gameTimeline.push({...card, justPlaced: true});
    gameScore++;
    updateScore();
    if (gameScore >= winTarget) {
      showResult(true, `✓ Perfect Run!${guessFeedback}`);
      renderTimeline(false);
      setTimeout(() => endGame(), 1500);
    } else {
      showResult(true, `✓ Correct!${guessFeedback}`);
      setControls('next');
      renderTimeline(false);
    }
  } else {
    lastCard = {...card, guessedAfter: prev ? prev.year : null, guessedBefore: next ? next.year : null};
    if (gameMode === 'hardcore') {
      showResult(false, `✗ Wrong! Eliminated${guessFeedback}`);
      document.getElementById('game-controls').innerHTML = '';
      renderTimeline(false);
      setTimeout(() => endGame(), 1800);
    } else {
      tokens--;
      tokensSpent++;
      updateTokenDisplay();
      if (tokens <= 0) {
        showResult(false, `✗ Wrong — no tokens left!${guessFeedback}`);
        document.getElementById('game-controls').innerHTML = '';
        renderTimeline(false);
        setTimeout(() => endGame(), 1800);
      } else {
        showResult(false, `✗ Wrong — ${tokens} heart${tokens !== 1 ? 's' : ''} left${guessFeedback}`);
        setControls('next');
        renderTimeline(false);
      }
    }
  }
}

async function nextCard() {
  // Clear justPlaced flags
  gameTimeline.forEach(c => delete c.justPlaced);
  gameIndex++;
  await loadCard();
}

// ============================================================
//  FOUR-OPTIONS MODE
// ============================================================
function confirmFourOptions(chosenYear) {
  const card = gameCards[gameIndex];
  const correct = chosenYear === card.year;

  // Reveal info
  const titleEl = document.getElementById('g-title');
  titleEl.textContent = card.title; titleEl.style.opacity = '';
  const artistEl = document.getElementById('g-artist');
  artistEl.textContent = card.artist; artistEl.style.opacity = '';
  document.getElementById('g-year').textContent = card.year;
  document.getElementById('g-year').classList.remove('hidden');
  document.getElementById('album-art').classList.add('visible');
  const revArt = document.getElementById('revealed-art');
  if (card.albumArt) { revArt.src = card.albumArt; revArt.style.display = ''; }
  document.getElementById('vinyl-wrap').style.display = 'none';

  if (correct) {
    gameTimeline.push({...card, justPlaced: true});
    gameScore++;
    updateScore();
    if (gameScore >= winTarget) {
      showResult(true, '✓ Perfect Run!');
      renderTimeline(false);
      setTimeout(() => endGame(), 1500);
    } else {
      showResult(true, '✓ Correct!');
      setControls('next');
      renderTimeline(false);
    }
  } else {
    lastCard = {...card, guessedYear: chosenYear};
    tokens--;
    updateTokenDisplay();
    if (tokens <= 0) {
      showResult(false, `✗ Wrong! It was ${card.year}. No lives left.`);
      document.getElementById('game-controls').innerHTML = '';
      renderTimeline(false);
      setTimeout(() => endGame(), 1800);
    } else {
      showResult(false, `✗ Wrong! It was ${card.year}. ${tokens} life${tokens !== 1 ? 's' : ''} left.`);
      setControls('next');
      renderTimeline(false);
    }
  }
}

// ============================================================
//  NAME-GUESS MODE
// ============================================================
function confirmNameGuess() {
  const card = gameCards[gameIndex];
  const artistInput = (document.getElementById('ac-artist')?.value || '').trim().toLowerCase();
  const titleInput  = (document.getElementById('ac-title')?.value  || '').trim().toLowerCase();

  const cardArtists = card.artist.toLowerCase().split(/,\s*/);
  const artistOk = artistInput && cardArtists.some(a => a === artistInput);
  const titleOk  = titleInput  && titleInput === card.title.toLowerCase();

  let pts = 0;
  if (artistOk) pts++;
  if (titleOk)  pts++;
  if (artistOk && titleOk) pts++; // bonus point for both

  // Reveal info
  const titleEl = document.getElementById('g-title');
  titleEl.textContent = card.title; titleEl.style.opacity = '';
  const artistEl = document.getElementById('g-artist');
  artistEl.textContent = card.artist; artistEl.style.opacity = '';
  document.getElementById('g-year').textContent = card.year;
  document.getElementById('g-year').classList.remove('hidden');
  document.getElementById('album-art').classList.add('visible');
  const revArt = document.getElementById('revealed-art');
  if (card.albumArt) { revArt.src = card.albumArt; revArt.style.display = ''; }
  document.getElementById('vinyl-wrap').style.display = 'none';

  gameScore += pts;
  updateScore();

  const gotAny = pts > 0;
  if (!gotAny) {
    tokens--;
    updateTokenDisplay();
  }

  let msg = '';
  if (pts === 3) msg = '✓ Perfect! +3 pts';
  else if (pts === 2) msg = `✓ ${artistOk ? 'Artist' : 'Title'} correct! +1 pt`;
  else if (pts === 1) msg = `✓ ${artistOk ? 'Artist' : 'Title'} correct! +1 pt`;
  else msg = `✗ Wrong! ${tokens > 0 ? tokens + ' life' + (tokens !== 1 ? 's' : '') + ' left.' : 'No lives left.'}`;

  const correct = pts > 0;
  showResult(correct, msg);

  if (!gotAny && tokens <= 0) {
    document.getElementById('game-controls').innerHTML = '';
    renderTimeline(false);
    setTimeout(() => endGame(), 1800);
  } else {
    if (pts > 0) gameTimeline.push({...card, justPlaced: true});
    if (gameScore >= winTarget) {
      renderTimeline(false);
      setTimeout(() => endGame(), 1500);
    } else {
      setControls('next');
      renderTimeline(false);
    }
  }
}

function endGame() {
  const titleEl = document.getElementById('go-title');
  const scoreEl = document.getElementById('go-score');
  const ctxEl = document.getElementById('go-context');
  const elimEl = document.getElementById('go-eliminated-card');
  const tokenStatsEl = document.getElementById('go-token-stats');
  const survived = gameScore;
  const isPerfect = survived >= winTarget;

  document.getElementById('go-mode').textContent =
    gameMode === 'standard'    ? 'Standard Mode' :
    gameMode === 'hardcore'    ? 'Hardcore Mode' :
    gameMode === 'four-options'? '4 Options Mode' :
    gameMode === 'name-guess'  ? 'Name Guess Mode' : '';

  if (isPerfect) {
    stopPlayback();
    titleEl.textContent = 'PERFECT RUN';
    titleEl.style.textShadow = '5px 5px 0 var(--teal)';
    scoreEl.textContent = survived;
    ctxEl.textContent = `All ${winTarget} songs placed correctly!`;
    elimEl.style.display = 'none';
    tokenStatsEl.style.display = 'none';
    document.getElementById('go-playlist').style.display = 'none';
  } else {
    titleEl.textContent = 'ELIMINATED';
    titleEl.style.textShadow = '5px 5px 0 var(--red)';
    scoreEl.textContent = survived;
    ctxEl.textContent = `${survived} / ${winTarget} songs placed correctly`;
    const plEl = document.getElementById('go-playlist');
    plEl.textContent = selectedPlaylistName;
    plEl.style.display = '';
    if (gameMode === 'standard') {
      tokenStatsEl.innerHTML = `♥ &nbsp;+${tokensEarned} earned &nbsp;·&nbsp; ${tokensSpent} spent &nbsp;·&nbsp; ${Math.max(0, tokens)} remaining`;
      tokenStatsEl.style.display = '';
    } else if (gameMode === 'name-guess' || gameMode === 'four-options') {
      tokenStatsEl.innerHTML = `♥ &nbsp;${Math.max(0, tokens)} / 3 lives remaining`;
      tokenStatsEl.style.display = '';
    } else {
      tokenStatsEl.style.display = 'none';
    }
    if (lastCard) {
      const artHtml = lastCard.albumArt
        ? `<img src="${lastCard.albumArt}" style="width:100px;height:100px;object-fit:cover;border-radius:4px;box-shadow:4px 4px 0 rgba(0,0,0,0.5);margin-bottom:10px">`
        : '';
      const rangeFrom = lastCard.guessedAfter != null ? lastCard.guessedAfter : null;
      const rangeTo = lastCard.guessedBefore != null ? lastCard.guessedBefore : null;
      const rangeStr = rangeFrom != null && rangeTo != null ? `${rangeFrom} – ${rangeTo}`
        : rangeFrom != null ? `after ${rangeFrom}`
        : rangeTo != null ? `before ${rangeTo}`
        : null;
      const guessRangeHtml = rangeStr
        ? `<div style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:0.12em;margin-top:8px">YOU GUESSED: <span style="color:rgba(255,255,255,0.55)">${rangeStr}</span></div>`
        : '';
      elimEl.innerHTML = `${artHtml}<div style="font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:6px">the song that got you</div><div style="font-family:'Playfair Display',serif;font-style:italic;font-size:18px;margin-bottom:4px">${escHtml(lastCard.title)}</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-bottom:6px">${escHtml(lastCard.artist)}</div><div style="font-family:'Bebas Neue',cursive;font-size:36px;color:var(--gold)">${lastCard.year}</div>${guessRangeHtml}`;
      elimEl.style.display = 'block';
    } else {
      elimEl.style.display = 'none';
    }
  }
  goTo('gameover');
}

function quitGame() {
  if (confirm('Quit this game?')) { stopPlayback(); goTo('picker'); }
}

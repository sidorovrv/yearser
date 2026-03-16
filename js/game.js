// ============================================================
//  TEAM COLORS FOR MULTIPLAYER
// ============================================================
const MULTI_COLORS = [
  { hex: '#4a9eff', name: 'Blue'   },
  { hex: '#2db84b', name: 'Green'  },
  { hex: '#ff8c00', name: 'Orange' },
  { hex: '#a855f7', name: 'Purple' },
  { hex: '#f0c040', name: 'Yellow' },
  { hex: '#e63329', name: 'Red'    },
  { hex: '#ff69b4', name: 'Pink'   },
  { hex: '#00bcd4', name: 'Cyan'   },
  { hex: '#ff6b6b', name: 'Coral'  },
  { hex: '#8bc34a', name: 'Lime'   },
  { hex: '#ff5722', name: 'Ember'  },
  { hex: '#9c27b0', name: 'Violet' },
];

// Fetch 2× the pool size so there's a good random sample without loading the whole playlist
const TRACK_FETCH_MULTIPLIER = 2;

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
  document.getElementById('mode-multiplayer').classList.toggle('active', m === 'multiplayer');
  const labels = {
    'standard':     '▶ Play Standard',
    'hardcore':     '▶ Play Hardcore',
    'four-options': '▶ Play 4 Options',
    'name-guess':   '▶ Play Name Guess',
    'multiplayer':  '▶ Play Multiplayer',
  };
  document.getElementById('start-btn').textContent = labels[m] || '▶ Play';
  // Show teams input only for multiplayer mode
  const teamsWrap = document.getElementById('num-teams-wrap');
  if (teamsWrap) teamsWrap.style.display = m === 'multiplayer' ? '' : 'none';
  // Hide pool input for multiplayer (pool is auto-calculated)
  const poolWrap = document.getElementById('num-pool-wrap');
  if (poolWrap) poolWrap.style.display = m === 'multiplayer' ? 'none' : '';
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

  const numTeams = gameMode === 'multiplayer'
    ? Math.max(2, parseInt(document.getElementById('num-teams').value) || 2)
    : 1;

  winTarget = Math.min(parseInt(document.getElementById('num-win').value) || 10, 50);
  const poolSize = gameMode === 'multiplayer'
    ? 2 * winTarget * numTeams                                  // auto pool for multiplayer
    : Math.min(parseInt(document.getElementById('num-pool').value) || 50, 500);

  // Fetch tracks from playlist (or Liked Songs) with early stopping
  const isLikedPlaylist = selectedPlaylistId === '__liked__';
  let tracks = [];
  const targetTracks = poolSize * TRACK_FETCH_MULTIPLIER; // fetch at most 2× the pool for a good random sample
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
    if (tracks.length >= targetTracks) break; // early stop — enough tracks collected
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

  if (gameMode === 'multiplayer') {
    await startMultiplayer(tracks, numTeams);
    return;
  }

  const actualPool = Math.min(poolSize, tracks.length);
  winTarget = Math.min(winTarget, actualPool - 1);
  gameCards = tracks.slice(0, actualPool);

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
    if (gameMode === 'multiplayer') {
      const msg = gameScore >= winTarget
        ? `✓ ${multiTeams[multiTeamIndex].color.name} hits ${winTarget}! 🎉`
        : `✓ Correct!`;
      showResult(true, msg);
      document.getElementById('game-controls').innerHTML = '';
      renderTimeline(false);
      setTimeout(async () => {
        gameTimeline.forEach(c => delete c.justPlaced);
        gameIndex++;
        await advanceMultiTurn();
      }, 1500);
    } else if (gameScore >= winTarget) {
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
    if (gameMode === 'multiplayer') {
      showResult(false, `✗ Wrong!`);
      document.getElementById('game-controls').innerHTML = '';
      renderTimeline(false);
      setTimeout(async () => {
        gameTimeline.forEach(c => delete c.justPlaced);
        gameIndex++;
        await advanceMultiTurn();
      }, 1500);
    } else if (gameMode === 'hardcore') {
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
  if (gameMode === 'multiplayer') {
    await advanceMultiTurn();
    return;
  }
  await loadCard();
}

// ============================================================
//  FOUR-OPTIONS MODE
// ============================================================
function confirmFourOptions(isCorrect) {
  const card = gameCards[gameIndex];
  const correct = isCorrect === true;

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
    lastCard = {...card};
    tokens--;
    updateTokenDisplay();
    if (tokens <= 0) {
      showResult(false, `✗ Wrong — no lives left!`);
      document.getElementById('game-controls').innerHTML = '';
      renderTimeline(false);
      setTimeout(() => endGame(), 1800);
    } else {
      showResult(false, `✗ Wrong! ${tokens} life${tokens !== 1 ? 's' : ''} left.`);
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
  const lbEl = document.getElementById('go-leaderboard');
  if (lbEl) lbEl.style.display = 'none';
  const survived = gameScore;
  const isPerfect = survived >= winTarget;

  document.getElementById('go-mode').textContent =
    gameMode === 'standard'    ? 'Standard Mode' :
    gameMode === 'hardcore'    ? 'Hardcore Mode' :
    gameMode === 'four-options'? '4 Options Mode' :
    gameMode === 'name-guess'  ? 'Name Guess Mode' :
    gameMode === 'multiplayer' ? 'Multiplayer Mode' : '';

  if (isPerfect) {
    stopPlayback();
    titleEl.textContent = 'PERFECT RUN';
    titleEl.style.textShadow = '5px 5px 0 var(--teal)';
    scoreEl.textContent = survived;
    ctxEl.textContent = `All ${winTarget} songs placed correctly!`;
    elimEl.style.display = 'none';
    tokenStatsEl.style.display = 'none';
    document.getElementById('go-playlist').style.display = 'none';
    goTo('gameover');
    triggerWinFlash('#1DB954', '#d4a843');
    return;
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

function triggerWinFlash(c1, c2) {
  const el = document.getElementById('win-flash');
  if (!el) return;
  const NUM = 8, STAGGER = 65;
  el.innerHTML = Array.from({ length: NUM }, (_, i) =>
    `<div class="wf-ring" style="border-color:${i % 2 === 0 ? c1 : c2};animation-delay:${i * STAGGER}ms"></div>`
  ).join('');
  el.style.display = '';
  setTimeout(() => { el.style.display = 'none'; el.innerHTML = ''; }, NUM * STAGGER + 750);
}

function quitGame() {
  if (confirm('Quit this game?')) { stopPlayback(); goTo('picker'); }
}

// ============================================================
//  MULTIPLAYER — SETUP
// ============================================================
async function startMultiplayer(allTracks, numTeams) {
  const clampedTeams = Math.min(numTeams, MULTI_COLORS.length);
  // Cards per team: enough for 2× winTarget guesses (buffer for wrong placements)
  const perTeam = Math.max(
    Math.floor(allTracks.length / clampedTeams),
    winTarget * 2 + 1
  );
  const totalNeeded = perTeam * clampedTeams;

  if (allTracks.length < totalNeeded) {
    const minNeeded = clampedTeams * (winTarget + 2);
    if (allTracks.length < minNeeded) {
      alert(`Not enough tracks for ${clampedTeams} teams. Try a larger playlist or reduce "Win at".`);
      goTo('picker');
      return;
    }
  }

  // Build each team's deck from non-overlapping slices of the shuffled pool
  const actualPerTeam = Math.floor(Math.min(allTracks.length, totalNeeded) / clampedTeams);
  multiTeams = MULTI_COLORS.slice(0, clampedTeams).map((color, i) => {
    const deck = allTracks.slice(i * actualPerTeam, (i + 1) * actualPerTeam);
    return {
      color,
      score: 0,
      cards: deck,
      index: 1,            // 0 = anchor, start guessing from 1
      timeline: [{ ...deck[0] }],  // anchor auto-placed
    };
  });
  multiTeamIndex = 0;
  multiRoundTeamCount = 0;
  multiTieBreaker = false;

  document.getElementById('g-pl-name').textContent = selectedPlaylistName;

  // Enrich anchor cards for all teams in the background (non-blocking)
  multiTeams.forEach(team => {
    const anchor = team.cards[0];
    if (anchor.isrc && !anchor.mbChecked) {
      anchor.mbChecked = true;
      mbLookup(anchor.isrc).then(mbYear => {
        if (mbYear !== null) {
          anchor.year = mbYear;
          if (team.timeline[0]) team.timeline[0].year = mbYear;
        }
      });
    }
  });

  showMultiHandoff();
}

// ============================================================
//  MULTIPLAYER — STATE SYNC
// ============================================================
function loadMultiTeamState(teamIdx) {
  const team = multiTeams[teamIdx];
  gameCards    = team.cards;
  gameIndex    = team.index;
  gameScore    = team.score;
  gameTimeline = team.timeline;
  tokens = Number.MAX_SAFE_INTEGER; // tokens unused in multiplayer — set high to prevent accidental game-over
}

function saveMultiTeamState() {
  const team = multiTeams[multiTeamIndex];
  team.cards    = gameCards;
  team.index    = gameIndex;
  team.score    = gameScore;
  team.timeline = gameTimeline;
}

// ============================================================
//  MULTIPLAYER — HANDOFF SCREEN
// ============================================================
function showMultiHandoff() {
  const team = multiTeams[multiTeamIndex];
  const { hex, name } = team.color;

  document.getElementById('handoff').style.background =
    `linear-gradient(175deg, ${hex}bb 0%, ${hex}55 45%, var(--black) 82%)`;

  document.getElementById('handoff-dot').style.background = hex;
  document.getElementById('handoff-dot').style.boxShadow = `0 0 40px ${hex}99, 0 0 80px ${hex}44`;
  document.getElementById('handoff-team-name').textContent = name;
  document.getElementById('handoff-team-name').style.color = hex;
  document.getElementById('handoff-team-name').style.textShadow = `4px 4px 0 ${hex}44`;

  // Tie-breaker indicator
  const tbEl = document.getElementById('handoff-tiebreaker');
  if (tbEl) tbEl.style.display = multiTieBreaker ? '' : 'none';

  // Score chips — all teams
  const scoresHtml = multiTeams.map((t, i) => {
    const active = i === multiTeamIndex;
    const chipStyle = active
      ? `style="--hsc-color:${t.color.hex};border-color:${t.color.hex};background:${t.color.hex}22"`
      : '';
    return `<div class="hsc-chip${active ? ' hsc-active' : ''}" ${chipStyle}>
      <span class="hsc-name">${escHtml(t.color.name)}</span>
      <span class="hsc-num">${t.score}</span>
    </div>`;
  }).join('');
  document.getElementById('handoff-scores').innerHTML = scoresHtml;

  goTo('handoff');
}

async function startHandoffTurn() {
  loadMultiTeamState(multiTeamIndex);

  const team = multiTeams[multiTeamIndex];
  const { hex } = team.color;

  // Tint the game header with team color
  const header = document.querySelector('.game-header');
  if (header) header.style.borderBottom = `2px solid ${hex}`;
  const scoreEl = document.getElementById('g-score');
  if (scoreEl) scoreEl.style.color = hex;

  // Multiplayer uses standard timeline — show it, hide tokens
  const tlSection = document.querySelector('.timeline-section');
  const divider   = document.querySelector('.divider');
  if (tlSection) tlSection.style.display = '';
  if (divider)   divider.style.display   = '';
  document.getElementById('token-wrap').style.display = 'none';

  // Clear the timeline DOM immediately to prevent flashing previous team's cards
  const tlContainer = document.getElementById('timeline');
  if (tlContainer) tlContainer.innerHTML = '';
  document.getElementById('game-controls').innerHTML = '';
  const banner = document.getElementById('result-banner');
  if (banner) banner.className = 'result-banner';

  updateScore();
  goTo('game');
  await loadCard();
}

// ============================================================
//  MULTIPLAYER — TURN ADVANCEMENT
// ============================================================
async function advanceMultiTurn() {
  saveMultiTeamState();
  multiRoundTeamCount++;

  // After all teams have played once in this round → check for winner
  if (multiRoundTeamCount >= multiTeams.length) {
    multiRoundTeamCount = 0;
    const winner = getMultiWinner();
    if (winner) {
      endMultiGame(winner);
      return;
    }
    // Check if all teams are out of cards
    const anyActive = multiTeams.some(t => t.index < t.cards.length);
    if (!anyActive) {
      const maxScore = Math.max(...multiTeams.map(t => t.score));
      endMultiGame(multiTeams.find(t => t.score === maxScore));
      return;
    }
    // Multiple teams at/above winTarget but no sole leader — enter tiebreaker
    const maxScore = Math.max(...multiTeams.map(t => t.score));
    if (maxScore >= winTarget) multiTieBreaker = true;
  }

  // Advance to next team that still has cards
  let nextIdx = (multiTeamIndex + 1) % multiTeams.length;
  let attempts = 0;
  while (multiTeams[nextIdx].index >= multiTeams[nextIdx].cards.length && attempts < multiTeams.length) {
    nextIdx = (nextIdx + 1) % multiTeams.length;
    attempts++;
  }
  multiTeamIndex = nextIdx;
  showMultiHandoff();
}

function getMultiWinner() {
  const maxScore = Math.max(...multiTeams.map(t => t.score));
  if (maxScore < winTarget) return null;
  const leaders = multiTeams.filter(t => t.score === maxScore);
  return leaders.length === 1 ? leaders[0] : null; // sole leader only
}

// ============================================================
//  MULTIPLAYER — GAME OVER
// ============================================================
function endMultiGame(winningTeam) {
  stopPlayback();

  document.getElementById('go-mode').textContent = 'Multiplayer Mode';

  const titleEl = document.getElementById('go-title');
  titleEl.textContent = winningTeam.color.name + ' Wins!';
  titleEl.style.textShadow = `5px 5px 0 ${winningTeam.color.hex}`;
  titleEl.style.color = '';

  document.getElementById('go-score').textContent = winningTeam.score;
  document.getElementById('go-context').textContent = `First to ${winTarget} correct placements wins!`;
  document.getElementById('go-eliminated-card').style.display = 'none';
  document.getElementById('go-playlist').style.display = 'none';
  document.getElementById('go-token-stats').style.display = 'none';

  // Leaderboard
  const sorted = [...multiTeams].sort((a, b) => b.score - a.score);
  const lbEl = document.getElementById('go-leaderboard');
  if (lbEl) {
    lbEl.innerHTML = sorted.map((t, i) => {
      const delay = `animation-delay:${i * 0.07}s`;
      const winner = i === 0;
      return `<div class="go-lb-row${winner ? ' go-lb-winner' : ''}" style="--team-color:${t.color.hex}${winner ? `;background:${t.color.hex}18` : ''};${delay}">
        <span class="go-lb-rank">${winner ? '🏆' : (i + 1) + '.'}</span>
        <span class="go-lb-team" style="color:${t.color.hex}">${escHtml(t.color.name)}</span>
        <span class="go-lb-score">${t.score}</span>
      </div>`;
    }).join('');
    lbEl.style.display = '';
  }

  // Reset game header styling
  const header = document.querySelector('.game-header');
  if (header) header.style.borderBottom = '';
  const scoreEl = document.getElementById('g-score');
  if (scoreEl) scoreEl.style.color = '';

  goTo('gameover');
  triggerWinFlash(winningTeam.color.hex, '#d4a843');
}

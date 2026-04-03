// ============================================================
//  GUEST.JS — rendering and interaction for non-host devices
//  Loaded on all devices; only activates when isHost === false.
// ============================================================

// ── Team choice screen ──────────────────────────────────────

function renderTeamChoiceScreen() {
  const nameEl = document.getElementById('tc-playlist-name');
  if (nameEl) nameEl.textContent = selectedPlaylistName || '';

  const grid = document.getElementById('tc-team-grid');
  if (!grid) return;

  grid.innerHTML = multiTeams.map((t, i) => {
    // Is this slot taken by a currently-connected device?
    const holder = Object.values(partyTeamRegistry)
      .find(v => v.teamIndex === i && v.connected);
    const isMe = holder && partyConn && holder.connId === getPartyConnId();
    const isTaken = !!holder && !isMe;
    const isMine = !!isMe || remoteTeamIndex === i;

    return `<button
      class="tc-team-btn${isMine ? ' tc-team-mine' : ''}${isTaken ? ' tc-team-taken' : ''}"
      style="--tc-color:${t.color.hex}"
      onclick="${isTaken ? '' : `claimTeam(${i})`}"
      ${isTaken ? 'disabled' : ''}>
      <span class="tc-dot" style="background:${t.color.hex}"></span>
      <span class="tc-name">${escHtml(t.color.name)}</span>
      <span class="tc-score">${t.score} pts</span>
      ${isTaken ? '<span class="tc-badge">Taken</span>' : ''}
      ${isMine ? '<span class="tc-badge tc-badge-mine">You</span>' : ''}
    </button>`;
  }).join('');
}

function claimTeam(teamIndex) {
  remoteTeamIndex = teamIndex;
  sendParty({ type: 'team-claim', teamIndex });
  // Optimistically update the UI right away
  renderTeamChoiceScreen();
}

function joinAsSpectator() {
  remoteTeamIndex = null; // null = spectator, can watch but not act
  // Hide Spotify-specific elements immediately so the game screen
  // doesn't flash "Searching for Spotify" before renderGuestGame runs.
  document.getElementById('spotify-player').style.display = 'none';
  document.getElementById('no-device-banner').style.display = 'none';
  goTo('game');
  renderGuestGame(_lastGuestState);
}

// ── Incoming full-state handler ──────────────────────────────

// Keep a reference to the last state so we can re-render on demand
let _lastGuestState = null;

function initGuestHandlers() {
  onPartyMessage('full-state', (state) => {
    _lastGuestState = state;

    // Hydrate shared global state from the broadcast snapshot
    if (state.teams) multiTeams = state.teams.map(t => ({
      ...t,
      // Guests don't receive deck cards — give empty placeholders
      cards: t.cards || [],
      index: t.index != null ? t.index : 1,
    }));
    if (state.gameMode != null) gameMode = state.gameMode;
    if (state.currentTeamIndex != null) multiTeamIndex = state.currentTeamIndex;
    if (state.winTarget != null) winTarget = state.winTarget;
    if (state.tieBreaker != null) multiTieBreaker = state.tieBreaker;
    if (state.playlistName != null) selectedPlaylistName = state.playlistName;
    if (state.teamRegistry != null) partyTeamRegistry = state.teamRegistry;
    partyPhase = state.phase;

    // If we're still on team-choice, refresh the grid.
    // If the game is already running and we've claimed a team, advance now.
    const current = document.querySelector('.screen.active');
    if (current && current.id === 'team-choice') {
      renderTeamChoiceScreen();
      if (remoteTeamIndex !== null && state.phase !== 'idle') {
        _routeGuestToPhase(state);
      }
      return;
    }

    _routeGuestToPhase(state);
  });

  onPartyMessage('team-registry-update', ({ registry }) => {
    if (registry) partyTeamRegistry = registry;
    const current = document.querySelector('.screen.active');
    if (current && current.id === 'team-choice') renderTeamChoiceScreen();
  });

  onPartyMessage('team-claim-rejected', ({ teamIndex }) => {
    if (remoteTeamIndex === teamIndex) {
      remoteTeamIndex = null;
      renderTeamChoiceScreen();
      // Show a brief feedback
      const grid = document.getElementById('tc-team-grid');
      if (grid) {
        const notice = document.createElement('div');
        notice.style.cssText = 'font-size:11px;color:var(--gold);text-align:center;margin-top:8px;';
        notice.textContent = 'That team was just taken — pick another.';
        grid.after(notice);
        setTimeout(() => notice.remove(), 2500);
      }
    }
  });

  onPartyMessage('host-override', ({ teamIndex }) => {
    // Host is taking over our team's turn — show a notice
    if (remoteTeamIndex === teamIndex) {
      _showGuestNotice('Host is playing this turn…');
    }
    // Stay on whatever screen we're on; host will broadcast the next state
  });
}

function _routeGuestToPhase(state) {
  const { phase, currentTeamIndex } = state;
  const isMyTurn = remoteTeamIndex !== null && remoteTeamIndex === currentTeamIndex;

  if (phase === 'handoff') {
    // If arriving from gameover (new game started), go back to team-choice
    // so the guest re-confirms their slot in the fresh registry.
    const current = document.querySelector('.screen.active');
    if (current && current.id === 'gameover') {
      renderTeamChoiceScreen();
      goTo('team-choice');
      return;
    }
    _renderGuestHandoff(state, isMyTurn);
  } else if (phase === 'place' || phase === 'confirm') {
    goTo('game');
    renderGuestGame(state);
  } else if (phase === 'result') {
    // Update result banner and card reveal, stay on game screen
    const current = document.querySelector('.screen.active');
    if (current && current.id !== 'game') goTo('game');
    renderGuestGame(state);
    if (state.resultBanner) {
      showResult(state.resultBanner.ok, state.resultBanner.msg);
    }
  } else if (phase === 'mst-place') {
    goTo('game');
    renderGuestMstPlace(state);
  } else if (phase === 'mst-result') {
    const current = document.querySelector('.screen.active');
    if (current && current.id !== 'game') goTo('game');
    renderGuestMstResult(state);
  } else if (phase === 'gameover') {
    _renderGuestGameOver(state);
  }
}

// ── Handoff screen for guests ────────────────────────────────

function _renderGuestHandoff(state, isMyTurn) {
  const team = multiTeams[state.currentTeamIndex];
  if (!team) return;
  const { hex, name } = team.color;

  const handoffEl = document.getElementById('handoff');
  handoffEl.style.setProperty('--handoff-color', hex);
  const r = parseInt(hex.slice(1,3), 16);
  const g_c = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  handoffEl.style.setProperty('--handoff-glow', `rgba(${r},${g_c},${b},0.18)`);

  document.getElementById('handoff-team-name').textContent = name;
  const line2El = document.getElementById('handoff-title-line2');
  if (line2El) line2El.textContent = isMyTurn ? 'Your Turn' : 'Their Turn';

  const tbEl = document.getElementById('handoff-tiebreaker');
  if (tbEl) tbEl.style.display = state.tieBreaker ? '' : 'none';

  const scoresHtml = multiTeams.map((t, i) => {
    const active = i === state.currentTeamIndex;
    const chipStyle = active
      ? `style="--hsc-color:${t.color.hex};border-color:${t.color.hex};background:${t.color.hex}22"`
      : '';
    return `<div class="hsc-chip${active ? ' hsc-active' : ''}" ${chipStyle}>
      <span class="hsc-name">${escHtml(t.color.name)}</span>
      <span class="hsc-num">${t.score}</span>
    </div>`;
  }).join('');
  document.getElementById('handoff-scores').innerHTML = scoresHtml;

  const readyBtn = document.getElementById('handoff-ready-btn');
  const overrideBtn = document.getElementById('handoff-override-btn');
  const instrEl = document.getElementById('handoff-instruction');

  if (isMyTurn) {
    if (readyBtn) {
      readyBtn.style.display = '';
      readyBtn.disabled = false;
      readyBtn.textContent = "I'm Ready — Let's Play →";
      readyBtn.onclick = guestReady;
    }
    if (overrideBtn) overrideBtn.style.display = 'none';
    if (instrEl) instrEl.innerHTML = "It's your turn!<br>Tap Ready when you're set to play";
  } else {
    if (readyBtn) readyBtn.style.display = 'none';
    if (overrideBtn) overrideBtn.style.display = 'none';
    if (instrEl) instrEl.textContent = `${name} is playing this round…`;
  }

  goTo('handoff');
}

function guestReady() {
  sendParty({ type: 'guest-ready', connId: getPartyConnId() });
  // Optimistic UI: show a "waiting" state
  const readyBtn = document.getElementById('handoff-ready-btn');
  if (readyBtn) { readyBtn.disabled = true; readyBtn.textContent = 'Waiting…'; }
}

// ── Game screen for guests ───────────────────────────────────

function renderGuestGame(state) {
  if (!state) return;

  const currentTeam = multiTeams[state.currentTeamIndex];
  if (!currentTeam) return;

  // Load the active team's timeline for rendering
  gameTimeline = [...(currentTeam.timeline || [])];
  gameScore = currentTeam.score;
  pendingPlacementIndex = state.pendingPlacementIndex != null ? state.pendingPlacementIndex : null;

  // Tint header with current team color
  const { hex, name } = currentTeam.color;
  const header = document.querySelector('.game-header');
  if (header) header.style.borderBottom = `2px solid ${hex}`;
  const scoreEl = document.getElementById('g-score');
  if (scoreEl) { scoreEl.textContent = gameScore; scoreEl.style.color = hex; }

  // Playlist name badge
  const plName = document.getElementById('g-pl-name');
  if (plName) plName.textContent = selectedPlaylistName || '';

  const teamBanner = document.getElementById('multi-team-banner');
  if (teamBanner) {
    teamBanner.textContent = `${name} is playing`;
    teamBanner.style.cssText = `display:block;background:${hex}18;color:${hex};border-bottom:1px solid ${hex}33;`;
  }

  // Update scores bar
  updateMultiScoresBar();

  // Card info
  const card = state.currentCard;
  const isResult = (state.phase === 'result' || state.phase === 'gameover');

  const titleEl = document.getElementById('g-title');
  const artistEl = document.getElementById('g-artist');
  const yearEl = document.getElementById('g-year');

  if (isResult && card) {
    titleEl.textContent = card.title || '—';
    titleEl.style.opacity = '';
    artistEl.textContent = card.artist || '';
    artistEl.style.opacity = '';
    if (card.year) { yearEl.textContent = card.year; yearEl.classList.remove('hidden'); }
    document.getElementById('album-art').classList.add('visible');
    const revArt = document.getElementById('revealed-art');
    if (card && card.albumArt) { revArt.src = card.albumArt; revArt.style.display = ''; }
    document.getElementById('vinyl-wrap').style.display = 'none';
  } else {
    titleEl.textContent = '• • • • •';
    titleEl.style.opacity = '0.25';
    artistEl.textContent = '• • •';
    artistEl.style.opacity = '0.2';
    yearEl.classList.add('hidden');
    document.getElementById('vinyl-wrap').style.display = '';
    const disc = document.getElementById('vinyl-disc');
    disc.classList.add('hidden-label');
    disc.classList.remove('spinning', 'playing');
    const artImg = document.getElementById('album-art');
    artImg.classList.remove('visible');
    if (card && card.albumArt) { artImg.src = card.albumArt; }
    const revArt = document.getElementById('revealed-art');
    revArt.style.display = 'none';
  }

  // Hide Spotify player on guest
  document.getElementById('spotify-player').style.display = 'none';
  document.getElementById('no-device-banner').style.display = 'none';

  // Timeline + controls
  const tlSection = document.querySelector('.timeline-section');
  const divider = document.querySelector('.divider');
  if (tlSection) tlSection.style.display = '';
  if (divider) divider.style.display = '';
  document.getElementById('token-wrap').style.display = 'none';

  const isMyTurn = remoteTeamIndex !== null && remoteTeamIndex === state.currentTeamIndex;
  const interactive = isMyTurn && (state.phase === 'place' || state.phase === 'confirm');
  renderTimeline(interactive);

  // Controls: guests who own this turn can interact; others see spectator badge
  const controlsEl = document.getElementById('game-controls');
  if (!isMyTurn) {
    controlsEl.innerHTML = `<div class="spectator-badge">👁 ${escHtml(name)} is playing</div>`;
  } else if (state.phase === 'place') {
    controlsEl.innerHTML = `<div style="font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.08em;text-align:center;padding:4px 0">↑ Tap a gap in the timeline to place your guess ↑</div>`;
  } else if (state.phase === 'confirm') {
    controlsEl.innerHTML = `
      <div style="font-size:11px;color:var(--teal);letter-spacing:0.08em;text-align:center;padding:4px 0">Tap another gap to move — or lock it in</div>
      <div class="controls-row"><button class="btn btn-primary" onclick="guestConfirmPlacement()">✓ &nbsp;Lock In</button></div>`;
  } else {
    controlsEl.innerHTML = '';
  }

  // Result banner
  if (state.resultBanner) {
    showResult(state.resultBanner.ok, state.resultBanner.msg);
  } else {
    document.getElementById('result-banner').className = 'result-banner';
  }
}

// Guest action: tap a drop zone
function guestTentativePlace(insertIndex) {
  pendingPlacementIndex = insertIndex;
  renderTimeline(true); // optimistic local render
  sendParty({ type: 'guest-action', action: 'place', insertIndex, connId: getPartyConnId() });
}

// Guest action: lock in
function guestConfirmPlacement() {
  sendParty({ type: 'guest-action', action: 'confirm', connId: getPartyConnId() });
  // Disable controls to avoid double-submit
  const controlsEl = document.getElementById('game-controls');
  if (controlsEl) controlsEl.innerHTML = '';
}

// ── Multi-shared (One Timeline) guest functions ──────────────

function renderGuestMstPlace(state) {
  if (!state) return;
  const card = state.currentCard;
  const submitted = Array.isArray(state.submittedTeams) ? state.submittedTeams : [];
  const alreadySubmitted = remoteTeamIndex !== null && submitted.includes(remoteTeamIndex);

  // Shared timeline
  gameTimeline = [...(state.sharedTimeline || [])];
  pendingPlacementIndex = alreadySubmitted ? null : pendingPlacementIndex;

  // Header / scores
  const header = document.querySelector('.game-header');
  if (header) header.style.borderBottom = '2px solid var(--teal)';
  updateMultiScoresBar();

  const teamBanner = document.getElementById('multi-team-banner');
  if (teamBanner) teamBanner.style.display = 'none';

  const plName = document.getElementById('g-pl-name');
  if (plName) plName.textContent = selectedPlaylistName || '';

  const scoreEl = document.getElementById('g-score');
  if (scoreEl && remoteTeamIndex !== null && multiTeams[remoteTeamIndex]) {
    const myTeam = multiTeams[remoteTeamIndex];
    scoreEl.textContent = myTeam.score;
    scoreEl.style.color = myTeam.color.hex;
  }

  // Card hidden
  document.getElementById('g-title').textContent = '• • • • •';
  document.getElementById('g-title').style.opacity = '0.25';
  document.getElementById('g-artist').textContent = '• • •';
  document.getElementById('g-artist').style.opacity = '0.2';
  document.getElementById('g-year').classList.add('hidden');
  document.getElementById('vinyl-wrap').style.display = '';
  const disc = document.getElementById('vinyl-disc');
  disc.classList.add('hidden-label');
  disc.classList.remove('spinning', 'playing');
  const artImg = document.getElementById('album-art');
  artImg.classList.remove('visible');
  if (card && card.albumArt) { artImg.src = card.albumArt; }
  document.getElementById('revealed-art').style.display = 'none';

  document.getElementById('spotify-player').style.display = 'none';
  document.getElementById('no-device-banner').style.display = 'none';
  document.getElementById('token-wrap').style.display = 'none';
  document.getElementById('result-banner').className = 'result-banner';

  const tlSection = document.querySelector('.timeline-section');
  const divider = document.querySelector('.divider');
  if (tlSection) tlSection.style.display = '';
  if (divider) divider.style.display = '';

  const interactive = !alreadySubmitted;
  renderTimeline(interactive);

  const controlsEl = document.getElementById('game-controls');
  if (alreadySubmitted) {
    const total = Object.values(state.teamRegistry || {}).filter(v => v.connected).length;
    controlsEl.innerHTML = `
      <div style="font-size:12px;color:var(--teal);letter-spacing:0.06em;text-align:center;padding:8px 0">
        ✓ Submitted! Waiting for others… (${submitted.length}/${total || '?'})
      </div>`;
  } else if (pendingPlacementIndex !== null) {
    controlsEl.innerHTML = `
      <div style="font-size:11px;color:var(--teal);letter-spacing:0.08em;text-align:center;padding:4px 0">Tap another gap to move — or lock it in</div>
      <div class="controls-row"><button class="btn btn-primary" onclick="guestMstLockIn()">✓ &nbsp;Lock In</button></div>`;
  } else {
    controlsEl.innerHTML = `<div style="font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.08em;text-align:center;padding:4px 0">↑ Tap a gap in the timeline to place your guess ↑</div>`;
  }
}

function renderGuestMstResult(state) {
  if (!state) return;
  const card = state.currentCard;
  const roundResults = Array.isArray(state.roundResults) ? state.roundResults : [];

  // Update shared timeline
  gameTimeline = [...(state.sharedTimeline || [])];
  pendingPlacementIndex = null;

  // Header / scores
  const header = document.querySelector('.game-header');
  if (header) header.style.borderBottom = '2px solid var(--teal)';
  updateMultiScoresBar();

  const teamBanner = document.getElementById('multi-team-banner');
  if (teamBanner) teamBanner.style.display = 'none';

  const plName = document.getElementById('g-pl-name');
  if (plName) plName.textContent = selectedPlaylistName || '';

  const scoreEl = document.getElementById('g-score');
  if (scoreEl && remoteTeamIndex !== null && multiTeams[remoteTeamIndex]) {
    const myTeam = multiTeams[remoteTeamIndex];
    scoreEl.textContent = myTeam.score;
    scoreEl.style.color = myTeam.color.hex;
  }

  // Show revealed card
  if (card) {
    document.getElementById('g-title').textContent = card.title || '—';
    document.getElementById('g-title').style.opacity = '';
    document.getElementById('g-artist').textContent = card.artist || '';
    document.getElementById('g-artist').style.opacity = '';
    if (card.year) {
      document.getElementById('g-year').textContent = card.year;
      document.getElementById('g-year').classList.remove('hidden');
    }
    document.getElementById('album-art').classList.add('visible');
    const revArt = document.getElementById('revealed-art');
    if (card.albumArt) { revArt.src = card.albumArt; revArt.style.display = ''; }
    document.getElementById('vinyl-wrap').style.display = 'none';
  }

  document.getElementById('spotify-player').style.display = 'none';
  document.getElementById('no-device-banner').style.display = 'none';
  document.getElementById('token-wrap').style.display = 'none';

  const tlSection = document.querySelector('.timeline-section');
  const divider = document.querySelector('.divider');
  if (tlSection) tlSection.style.display = '';
  if (divider) divider.style.display = '';

  renderTimeline(false);

  // Show this team's result
  const myResult = remoteTeamIndex !== null
    ? roundResults.find(r => r.teamIndex === remoteTeamIndex)
    : null;

  if (myResult) {
    showResult(myResult.correct, myResult.correct ? '✓ Correct!' : '✗ Wrong placement');
  } else if (!state.gameOver) {
    showResult(false, '✗ No guess submitted');
  }

  document.getElementById('game-controls').innerHTML = '';

  // If game over, switch to gameover screen
  if (state.gameOver) {
    setTimeout(() => _renderGuestGameOver(state), 1500);
  }
}

// Multi-shared: guest locks in their guess
function guestMstLockIn() {
  if (pendingPlacementIndex === null) return;
  const insertIndex = pendingPlacementIndex;
  sendParty({ type: 'guest-action', action: 'mst-guess', insertIndex, connId: getPartyConnId() });
  // Optimistically show submitted state
  const controlsEl = document.getElementById('game-controls');
  if (controlsEl) {
    controlsEl.innerHTML = `
      <div style="font-size:12px;color:var(--teal);letter-spacing:0.06em;text-align:center;padding:8px 0">
        ✓ Submitted! Waiting for others…
      </div>`;
  }
}

// ── Game over for guests ─────────────────────────────────────


function _renderGuestGameOver(state) {
  // Determine winner by highest score (same logic as host's endMultiGame)
  const sorted = [...multiTeams].sort((a, b) => b.score - a.score);
  const winningTeam = sorted[0];
  if (!winningTeam) { goTo('gameover'); return; }

  const { hex, name } = winningTeam.color;

  document.getElementById('go-mode').textContent =
    gameMode === 'multi-shared' ? 'One Timeline Mode' : 'Multiplayer Mode';
  const titleEl = document.getElementById('go-title');
  titleEl.textContent = name + ' Wins!';
  titleEl.style.textShadow = `5px 5px 0 ${hex}`;
  titleEl.style.color = '';

  document.getElementById('go-score').textContent = winningTeam.score;
  document.getElementById('go-context').textContent =
    `First to ${state.winTarget || winTarget} correct placements wins!`;
  document.getElementById('go-eliminated-card').style.display = 'none';

  const plEl = document.getElementById('go-playlist');
  plEl.textContent = selectedPlaylistName;
  plEl.style.display = '';

  const totalGuessed = multiTeams.reduce((s, t) => s + t.score, 0);
  const totalPlayed = multiTeams.reduce((s, t) => s + Math.max(0, (t.index || 1) - 1), 0);
  const statsEl = document.getElementById('go-token-stats');
  statsEl.textContent = `${totalGuessed} correct / ${totalPlayed} songs played`;
  statsEl.style.display = '';

  document.getElementById('go-final-timeline').style.display = 'none';
  const viewTlBtn = document.getElementById('go-view-timelines-btn');
  if (viewTlBtn) viewTlBtn.style.display = '';

  // Leaderboard
  const lbEl = document.getElementById('go-leaderboard');
  if (lbEl) {
    lbEl.innerHTML = sorted.map((t, i) => {
      const winner = i === 0;
      return `<div class="go-lb-row${winner ? ' go-lb-winner' : ''}" style="--team-color:${t.color.hex}${winner ? `;background:${t.color.hex}18` : ''};animation-delay:${i * 0.07}s">
        <span class="go-lb-rank">${winner ? '🏆' : (i + 1) + '.'}</span>
        <div class="go-lb-team-wrap">
          <span class="go-lb-team" style="color:${t.color.hex}">${escHtml(t.color.name)}</span>
        </div>
        <span class="go-lb-score">${t.score}</span>
      </div>`;
    }).join('');
    lbEl.style.display = '';
  }

  document.getElementById('gameover').style.background =
    `radial-gradient(ellipse at 50% 30%, ${hex}44 0%, ${hex}14 55%, var(--black) 78%)`;

  // Hide host-only actions
  const playAgainBtn = document.getElementById('go-play-again-btn');
  if (playAgainBtn) playAgainBtn.style.display = 'none';
  const changePlaylistBtn = document.getElementById('go-change-playlist-btn');
  if (changePlaylistBtn) changePlaylistBtn.style.display = 'none';

  const header = document.querySelector('.game-header');
  if (header) header.style.borderBottom = '';

  goTo('gameover');
}

// ── Helpers ─────────────────────────────────────────────────

function _showGuestNotice(msg) {
  let notice = document.getElementById('guest-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'guest-notice';
    notice.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid rgba(255,255,255,0.15);padding:8px 18px;font-size:11px;letter-spacing:0.08em;color:rgba(255,255,255,0.6);z-index:9999;pointer-events:none;';
    document.body.appendChild(notice);
  }
  notice.textContent = msg;
  notice.style.opacity = '1';
  clearTimeout(notice._hideTimer);
  notice._hideTimer = setTimeout(() => { notice.style.opacity = '0'; }, 2500);
}

// initGuestHandlers() is called explicitly from initGuestMode() in app.js
// once isHost has been set to false.

// ============================================================
//  UI HELPERS
// ============================================================
// Returns 'Host' for teams with no connected remote device (PartyKit session)
function getTeamLabel(teamIndex) {
  if (!partyRoomId || !multiTeams[teamIndex]) return multiTeams[teamIndex]?.color?.name || '';
  const claimed = Object.values(partyTeamRegistry).some(v => v.teamIndex === teamIndex && v.connected);
  return claimed ? multiTeams[teamIndex].color.name : 'Host';
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showResult(ok, msg) {
  const el = document.getElementById('result-banner');
  el.textContent = msg;
  el.className = 'result-banner ' + (ok ? 'correct' : 'wrong');
}

function updateScore() { document.getElementById('g-score').textContent = gameScore; updateTokenDisplay(); updateMultiScoresBar(); }
function getSorted() { return [...gameTimeline].sort((a, b) => a.year - b.year); }

function updateMultiScoresBar() {
  const bar = document.getElementById('multi-scores-bar');
  if (!bar) return;
  if (gameMode !== 'multiplayer' || !multiTeams.length) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  bar.innerHTML = multiTeams.map((t, i) => {
    const active = i === multiTeamIndex;
    return `<span class="msb-chip${active ? ' msb-active' : ''}" style="--team-color:${t.color.hex}">
      <span class="msb-dot"></span>
      <span class="msb-name">${escHtml(t.color.name)}</span>
      <span class="msb-score">${t.score}</span>
    </span>`;
  }).join('');
}

function updateTokenDisplay() {
  const wrap = document.getElementById('token-wrap');
  if (!wrap) return;
  const showHearts = gameMode === 'standard' || gameMode === 'four-options' || gameMode === 'name-guess';
  wrap.style.display = showHearts ? 'inline-flex' : 'none';
  if (showHearts) document.getElementById('token-count').textContent = tokens;
}

// ============================================================
//  CONTROLS RENDERING
// ============================================================
function setControls(mode, card) {
  const el = document.getElementById('game-controls');

  // Spectator guard: non-host devices that don't own the current team see a read-only badge
  if (!isHost && remoteTeamIndex !== null && remoteTeamIndex !== multiTeamIndex) {
    const teamName = (multiTeams[multiTeamIndex] && multiTeams[multiTeamIndex].color.name) || '';
    el.innerHTML = `<div class="spectator-badge">\ud83d\udc41 ${escHtml(teamName)} is playing</div>`;
    return;
  }
  // Pure spectator (no team claimed) also gets read-only badge
  if (!isHost && remoteTeamIndex === null) {
    el.innerHTML = `<div class="spectator-badge">\ud83d\udc41 Spectating</div>`;
    return;
  }

  const guessBlock = gameMode === 'standard' ? `
    <div style="width:100%;max-width:340px;margin-bottom:10px">
      <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:8px">Guess for +1 token (optional)</div>
      <div class="ac-wrap" style="margin-bottom:6px">
        <input class="ac-input" id="ac-artist" type="text" placeholder="Artist name…" value="${escHtml(pendingArtistGuess||'')}" oninput="onAcInput('artist',this.value)" autocomplete="off">
        <div class="ac-dropdown" id="ac-artist-drop"></div>
      </div>
      <div class="ac-wrap">
        <input class="ac-input" id="ac-title" type="text" placeholder="Song title…" value="${escHtml(pendingTitleGuess||'')}" oninput="onAcInput('title',this.value)" autocomplete="off">
        <div class="ac-dropdown" id="ac-title-drop"></div>
      </div>
    </div>` : '';
  if (mode === 'place-hint') {
    el.innerHTML = guessBlock + `<div style="font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.08em;text-align:center;padding:4px 0">↑ Tap a gap in the timeline to place your guess ↑</div>`;
  } else if (mode === 'confirm') {
    const _override = isHost && gameMode === 'multiplayer' &&
      Object.values(partyTeamRegistry).some(v => v.teamIndex === multiTeamIndex && v.connected);
    const _hint = _override ? 'Tap another gap to move — or override their guess' : 'Tap another gap to move — or lock it in';
    const _btnLabel = _override ? '⚡\u00a0Override' : '✓\u00a0&nbsp;Lock In';
    el.innerHTML = guessBlock + `
      <div style="font-size:11px;color:var(--teal);letter-spacing:0.08em;text-align:center;padding:4px 0">${_hint}</div>
      <div class="controls-row"><button class="btn btn-primary" onclick="confirmPlacement()">${_btnLabel}</button></div>`;
  } else if (mode === 'next') {
    el.innerHTML = `<div class="controls-row"><button class="btn btn-primary btn-wide" onclick="nextCard()">Next Song →</button></div>`;
  } else if (mode === 'four-options' && card) {
    // Build 4 artist/title options: correct + 3 wrong from the pool
    const otherCards = gameCards
      .filter((c, i) => i !== gameIndex && c.title.toLowerCase() !== card.title.toLowerCase());
    // Shuffle
    for (let i = otherCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [otherCards[i], otherCards[j]] = [otherCards[j], otherCards[i]];
    }
    // Pick up to 3 unique wrong options (unique by title)
    const seenTitles = new Set([card.title.toLowerCase()]);
    const wrongOptions = [];
    for (const c of otherCards) {
      if (wrongOptions.length >= 3) break;
      if (!seenTitles.has(c.title.toLowerCase())) {
        seenTitles.add(c.title.toLowerCase());
        wrongOptions.push({ artist: c.artist, title: c.title });
      }
    }
    const allOptions = [
      { artist: card.artist, title: card.title, correct: true },
      ...wrongOptions.map(o => ({ ...o, correct: false }))
    ].sort(() => Math.random() - 0.5);
    el.innerHTML = `
      <div style="width:100%;max-width:340px">
        <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:10px;text-align:center">Which song is playing?</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${allOptions.map(o => `<button class="btn btn-secondary" style="text-align:left;padding:10px 14px;width:100%;" onclick="confirmFourOptions(${o.correct})"><span style="display:block;font-size:12px;color:var(--cream);letter-spacing:0.05em">${escHtml(o.title)}</span><span style="display:block;font-size:10px;color:rgba(255,255,255,0.45);margin-top:3px;letter-spacing:0.05em">${escHtml(o.artist)}</span></button>`).join('')}
        </div>
      </div>`;
  } else if (mode === 'name-guess') {
    el.innerHTML = `
      <div style="width:100%;max-width:340px;margin-bottom:8px">
        <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:8px;text-align:center">Guess artist &amp; title — 3 pts for both, 1 for each</div>
        <div class="ac-wrap" style="margin-bottom:6px">
          <input class="ac-input" id="ac-artist" type="text" placeholder="Artist name…" oninput="onAcInput('artist',this.value)" autocomplete="off">
          <div class="ac-dropdown" id="ac-artist-drop"></div>
        </div>
        <div class="ac-wrap" style="margin-bottom:10px">
          <input class="ac-input" id="ac-title" type="text" placeholder="Song title…" oninput="onAcInput('title',this.value)" autocomplete="off">
          <div class="ac-dropdown" id="ac-title-drop"></div>
        </div>
        <div class="controls-row"><button class="btn btn-primary btn-wide" onclick="confirmNameGuess()">✓ Submit Guess</button></div>
      </div>`;
  } else {
    el.innerHTML = '';
  }
}

// ============================================================
//  TIMELINE RENDERING
// ============================================================
function renderTimeline(interactive = false) {
  const sorted = getSorted();
  const container = document.getElementById('timeline');

  const mkDrop = (slotIdx, label) => {
    if (interactive && pendingPlacementIndex === slotIdx) {
      return `<div class="t-card t-card-ghost" style="border:2px solid var(--teal);background:rgba(29,185,84,0.1);cursor:default;flex-shrink:0;">
        <div class="t-vinyl"></div>
        <div class="t-year" style="color:var(--teal)">????</div>
        <div class="t-title" style="color:rgba(29,185,84,0.8)">here?</div>
      </div>`;
    }
    return interactive
      ? `<div class="drop-zone active" onclick="tentativePlaceCard(${slotIdx})" title="${label}">+</div>`
      : '';
  };

  let html = mkDrop(0, sorted.length ? `Before ${sorted[0].year}` : 'Place here');

  sorted.forEach((card, i) => {
    const color = yearToColor(card.year);
    const bgStyle = card.albumArt
      ? `background:linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.82)),url(${card.albumArt}) center/cover no-repeat`
      : `background:linear-gradient(180deg,${color}33 0%,rgba(0,0,0,0.8) 100%)`;
    html += `<div class="t-card ${card.justPlaced ? 'just-placed' : ''}" style="border-top:3px solid ${color};${bgStyle};flex-shrink:0;">
      <div class="t-year" style="color:${color}">${card.year}</div>
      <div class="t-title">${escHtml(card.title)}</div>
      <div class="t-artist">${escHtml(card.artist)}</div>
    </div>`;
    // Only show a drop zone if the next card has a different year
    const nextCard = sorted[i + 1];
    if (!nextCard || nextCard.year !== card.year) {
      html += mkDrop(i + 1, `After ${card.year}`);
    }
  });

  const inner = html || `<div style="font-size:11px;color:rgba(255,255,255,0.2);padding:0 4px">—</div>`;
  const prevScroll = container.scrollLeft;
  const showingGhost = interactive && pendingPlacementIndex !== null;
  container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;min-width:max-content;padding:0 8px">${inner}</div>`;
  requestAnimationFrame(() => {
    if (showingGhost) {
      const ghost = container.querySelector('.t-card-ghost');
      if (ghost) {
        ghost.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
      } else {
        container.scrollLeft = prevScroll;
      }
    } else if (prevScroll === 0) {
      container.scrollLeft = container.scrollWidth;
    } else {
      container.scrollLeft = prevScroll;
    }
  });
}

function yearToColor(year) {
  const pct = Math.max(0, Math.min(1, (year - 1950) / 70));
  const hue = Math.round(30 + pct * 150); // orange(30) → teal(180)
  return `hsl(${hue}, 75%, 58%)`;
}

function buildTimelineHtml(sorted) {
  return sorted.map(card => {
    const color = yearToColor(card.year);
    const bgStyle = card.albumArt
      ? `background:linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.82)),url(${card.albumArt}) center/cover no-repeat`
      : `background:linear-gradient(180deg,${color}33 0%,rgba(0,0,0,0.8) 100%)`;
    return `<div class="t-card" style="border-top:3px solid ${color};${bgStyle};flex-shrink:0;">
      <div class="t-year" style="color:${color}">${card.year}</div>
      <div class="t-title">${escHtml(card.title)}</div>
      <div class="t-artist">${escHtml(card.artist)}</div>
    </div>`;
  }).join('');
}

// ============================================================
//  QR SHARE MODAL
// ============================================================
function showQrModal() {
  if (!partyRoomId) return;
  const modal = document.getElementById('qr-modal');
  if (!modal) return;

  const url = getShareURL(partyRoomId);

  const linkInput = document.getElementById('qr-link-input');
  if (linkInput) linkInput.value = url;

  // Use api.qrserver.com — free, no library needed, returns a PNG
  const img = document.getElementById('qr-img');
  if (img) {
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=111111&color=fffbe6&qzone=1&data=${encodeURIComponent(url)}`;
  }

  updateQrModal();
  modal.style.display = '';
}

function updateQrModal() {
  const teamsEl = document.getElementById('qr-teams');
  if (!teamsEl) return;
  if (!multiTeams.length) { teamsEl.innerHTML = ''; return; }

  teamsEl.innerHTML = multiTeams.map((t, i) => {
    const holder = Object.values(partyTeamRegistry)
      .find(v => v.teamIndex === i && v.connected);
    const connected = !!holder;
    const statusText = connected ? 'Connected' : 'Host';
    const statusClass = connected ? 'qr-connected' : 'qr-host';
    const kickBtn = connected
      ? `<button class="qr-kick-btn" onclick="kickDevice('${holder.connId}')" title="Remove this device">✕</button>`
      : '';
    return `<div class="qr-team-row">
      <span class="qr-team-dot" style="background:${t.color.hex}"></span>
      <span class="qr-team-name">${escHtml(t.color.name)}</span>
      <span class="qr-team-status ${statusClass}">${statusText}</span>
      ${kickBtn}
    </div>`;
  }).join('');
}

function copyShareLink() {
  if (!partyRoomId) return;
  const url = getShareURL(partyRoomId);
  const btn = document.getElementById('qr-copy-btn');
  navigator.clipboard.writeText(url).then(() => {
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1800); }
  }).catch(() => {
    // Fallback: select the input
    const input = document.getElementById('qr-link-input');
    if (input) { input.select(); document.execCommand('copy'); }
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1800); }
  });
}

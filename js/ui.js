// ============================================================
//  UI HELPERS
// ============================================================
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showResult(ok, msg) {
  const el = document.getElementById('result-banner');
  el.textContent = msg;
  el.className = 'result-banner ' + (ok ? 'correct' : 'wrong');
}

function updateScore() { document.getElementById('g-score').textContent = gameScore; updateTokenDisplay(); }
function getSorted() { return [...gameTimeline].sort((a, b) => a.year - b.year); }

function updateTokenDisplay() {
  const wrap = document.getElementById('token-wrap');
  if (!wrap) return;
  wrap.style.display = gameMode === 'standard' ? 'inline-flex' : 'none';
  if (gameMode === 'standard') document.getElementById('token-count').textContent = tokens;
}

// ============================================================
//  CONTROLS RENDERING
// ============================================================
function setControls(mode) {
  const el = document.getElementById('game-controls');
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
    el.innerHTML = guessBlock + `
      <div style="font-size:11px;color:var(--teal);letter-spacing:0.08em;text-align:center;padding:4px 0">Tap another gap to move — or lock it in</div>
      <div class="controls-row"><button class="btn btn-primary" onclick="confirmPlacement()">✓ &nbsp;Lock In</button></div>`;
  } else if (mode === 'next') {
    el.innerHTML = `<div class="controls-row"><button class="btn btn-primary" onclick="nextCard()">Next Song →</button></div>`;
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
  const wasAtEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 4;
  container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;min-width:max-content;padding:0 8px">${inner}</div>`;
  if (wasAtEnd || prevScroll === 0) {
    container.scrollLeft = container.scrollWidth;
  } else {
    container.scrollLeft = prevScroll;
  }
}

function yearToColor(year) {
  const pct = Math.max(0, Math.min(1, (year - 1950) / 70));
  const hue = Math.round(30 + pct * 150); // orange(30) → teal(180)
  return `hsl(${hue}, 75%, 58%)`;
}

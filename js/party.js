// ============================================================
//  PARTY.JS — PartyKit client connection manager
//  Loaded on both host and guest devices.
// ============================================================

// ---- handler registry ----
const _partyHandlers = {};

function _dispatchPartyMessage(msg) {
  const handlers = _partyHandlers[msg.type];
  if (handlers) handlers.forEach(fn => fn(msg));
}

/**
 * Register a handler for a specific message type.
 * Multiple handlers per type are allowed.
 */
function onPartyMessage(type, fn) {
  if (!_partyHandlers[type]) _partyHandlers[type] = [];
  _partyHandlers[type].push(fn);
}

// ---- room ID ----
function generateRoomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// ---- send helper ----
function sendParty(msgObj) {
  if (!partyConn || partyConn.readyState !== 1 /* OPEN */) return;
  partyConn.send(JSON.stringify(msgObj));
}

// ---- share URL ----
function getShareURL(roomId) {
  return window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(roomId);
}

// ---- host connection ----
async function initPartyHost(roomId) {
  const host = typeof PARTYKIT_HOST !== 'undefined' ? PARTYKIT_HOST : 'localhost:1999';
  partyConn = new PartySocket({ host, room: roomId, id: 'host' });

  return new Promise((resolve) => {
    partyConn.addEventListener('open', () => {
      // Identify this connection as the host
      sendParty({ type: 'hello', role: 'host' });
      resolve();
    });

    partyConn.addEventListener('message', (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      _dispatchPartyMessage(msg);
    });

    partyConn.addEventListener('error', (e) => {
      console.warn('[PartyKit] host connection error', e);
      resolve(); // don't block the game on connection failure
    });
  });
}

// ---- guest connection ----
async function initPartyGuest(roomId) {
  const host = typeof PARTYKIT_HOST !== 'undefined' ? PARTYKIT_HOST : 'localhost:1999';
  partyConn = new PartySocket({ host, room: roomId });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timed out — no game state received'));
    }, 15000);

    const clearAndResolve = () => {
      clearTimeout(timeout);
      resolve();
    };

    partyConn.addEventListener('open', () => {
      sendParty({ type: 'hello', role: 'guest' });
    });

    partyConn.addEventListener('message', (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      _dispatchPartyMessage(msg);

      // Resolve the promise once we receive game state (first sync)
      if (msg.type === 'full-state' || msg.type === 'team-registry-update') {
        clearAndResolve();
      }
    });

    partyConn.addEventListener('error', (e) => {
      console.warn('[PartyKit] guest connection error', e);
      clearTimeout(timeout);
      reject(e);
    });
  });
}

// ---- disconnect ----
function disconnectParty() {
  if (partyConn) {
    partyConn.close();
    partyConn = null;
  }
  partyRoomId = null;
}

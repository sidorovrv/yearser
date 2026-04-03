// ============================================================
//  PARTY.JS — PartyKit client connection manager
//  Uses native WebSocket — no external library needed.
//  PartyKit respects ?_pk_id=<id> as the server-side conn.id,
//  which is the same mechanism partysocket uses internally.
// ============================================================

// ---- handler registry ----
const _partyHandlers = {};

function _dispatchPartyMessage(msg) {
  const handlers = _partyHandlers[msg.type];
  if (handlers) handlers.forEach(fn => fn(msg));
}

function onPartyMessage(type, fn) {
  if (!_partyHandlers[type]) _partyHandlers[type] = [];
  _partyHandlers[type].push(fn);
}

// ---- stable client ID (persists across reconnects) ----
let _myConnId = null;

function getPartyConnId() { return _myConnId; }

// ---- room ID ----
function generateRoomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// ---- share URL ----
function getShareURL(roomId) {
  return window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(roomId);
}

// ---- send helper ----
function sendParty(msgObj) {
  if (!partyConn || partyConn.readyState !== 1) return;
  partyConn.send(JSON.stringify(msgObj));
}

// ---- WebSocket URL builder ----
function _makeWsUrl(host, roomId) {
  const proto = host.startsWith('localhost') ? 'ws' : 'wss';
  return `${proto}://${host}/party/${encodeURIComponent(roomId)}?_pk_id=${encodeURIComponent(_myConnId)}`;
}

// ---- reconnecting WebSocket factory ----
// Returns an object with the same .send() / .readyState / .id interface
// that the rest of the code expects.
function _createConnection(host, roomId, onOpen, onMessage) {
  let ws = null;
  let dead = false;
  let retryDelay = 1000;

  const conn = {
    id: _myConnId,
    get readyState() { return ws ? ws.readyState : 3; },
    send(data) { if (ws && ws.readyState === 1) ws.send(data); },
    close() { dead = true; ws && ws.close(); },
  };

  function connect() {
    ws = new WebSocket(_makeWsUrl(host, roomId));

    ws.addEventListener('open', () => {
      retryDelay = 1000;
      onOpen();
    });

    ws.addEventListener('message', (evt) => {
      onMessage(evt.data);
    });

    ws.addEventListener('close', () => {
      if (!dead) setTimeout(connect, retryDelay = Math.min(retryDelay * 1.5, 8000));
    });

    ws.addEventListener('error', () => { /* close event handles retry */ });
  }

  connect();
  return conn;
}

// ---- host connection ----
function initPartyHost(roomId) {
  if (!_myConnId) _myConnId = generateRoomId();
  const host = typeof PARTYKIT_HOST !== 'undefined' ? PARTYKIT_HOST : 'localhost:1999';

  return new Promise((resolve) => {
    // Resolve after 5 s even if connection never opens — game works locally
    const fallback = setTimeout(resolve, 5000);

    partyConn = _createConnection(host, roomId,
      () => { // onOpen
        clearTimeout(fallback);
        sendParty({ type: 'hello', role: 'host' });
        resolve();
      },
      (data) => { // onMessage
        let msg; try { msg = JSON.parse(data); } catch { return; }
        _dispatchPartyMessage(msg);
      }
    );
  });
}

// ---- guest connection ----
function initPartyGuest(roomId) {
  if (!_myConnId) _myConnId = generateRoomId();
  const host = typeof PARTYKIT_HOST !== 'undefined' ? PARTYKIT_HOST : 'localhost:1999';

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timed out')), 15000);
    let resolved = false;

    const done = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve();
    };

    partyConn = _createConnection(host, roomId,
      () => { // onOpen
        sendParty({ type: 'hello', role: 'guest' });
      },
      (data) => { // onMessage
        let msg; try { msg = JSON.parse(data); } catch { return; }
        _dispatchPartyMessage(msg);
        // Resolve as soon as we get any game state
        if (msg.type === 'full-state' || msg.type === 'team-registry-update') done();
      }
    );
  });
}

// ---- disconnect ----
function disconnectParty() {
  if (partyConn) { partyConn.close(); partyConn = null; }
  partyRoomId = null;
  _myConnId = null;
}

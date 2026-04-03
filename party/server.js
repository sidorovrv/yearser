// ============================================================
//  PartyKit server — relay + state cache for Timeline FM
//  Deployed: npx partykit deploy
// ============================================================

export default {
  // --------------------------------------------------------
  //  onConnect — new client joins the room
  // --------------------------------------------------------
  async onConnect(conn, room) {
    // Replay the latest full-state snapshot so late joiners sync instantly
    const savedState = await room.storage.get('full-state');
    if (savedState) {
      conn.send(savedState);
    }

    // Also send current team registry
    const registry = await room.storage.get('team-registry');
    if (registry) {
      conn.send(JSON.stringify({ type: 'team-registry-update', registry: JSON.parse(registry) }));
    }
  },

  // --------------------------------------------------------
  //  onMessage — relay with selective handling
  // --------------------------------------------------------
  async onMessage(message, sender, room) {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return; // ignore malformed messages
    }

    // ---- full-state (host → all) ----
    if (msg.type === 'full-state') {
      // Cache for late joiners
      await room.storage.put('full-state', message);
      if (msg.teamRegistry) {
        await room.storage.put('team-registry', JSON.stringify(msg.teamRegistry));
      }
      // Broadcast to all except sender
      room.broadcast(message, [sender.id]);
      return;
    }

    // ---- team-claim (guest → server: claim a team slot) ----
    if (msg.type === 'team-claim') {
      const registryRaw = await room.storage.get('team-registry');
      const registry = registryRaw ? JSON.parse(registryRaw) : {};

      // Check if that team index is already claimed by an active connection
      const alreadyTaken = Object.values(registry).some(
        v => v.teamIndex === msg.teamIndex && v.connId !== sender.id
      );

      if (alreadyTaken) {
        sender.send(JSON.stringify({ type: 'team-claim-rejected', teamIndex: msg.teamIndex }));
        return;
      }

      // Register the claim
      // Remove any prior claim by this connection
      for (const key of Object.keys(registry)) {
        if (registry[key].connId === sender.id) delete registry[key];
      }
      registry[sender.id] = { teamIndex: msg.teamIndex, connId: sender.id, connected: true };
      await room.storage.put('team-registry', JSON.stringify(registry));

      // Relay to host (broadcast to all — host interprets it)
      room.broadcast(JSON.stringify({
        type: 'team-claim',
        teamIndex: msg.teamIndex,
        connId: sender.id,
      }), [sender.id]);

      return;
    }

    // ---- on disconnect: free team claim ----
    // (handled in onClose below)

    // ---- everything else: relay to all except sender ----
    room.broadcast(message, [sender.id]);
  },

  // --------------------------------------------------------
  //  onClose — free claimed team slot
  // --------------------------------------------------------
  async onClose(conn, room) {
    const registryRaw = await room.storage.get('team-registry');
    if (!registryRaw) return;
    const registry = JSON.parse(registryRaw);

    const entry = registry[conn.id];
    if (!entry) return;

    // Mark as disconnected rather than deleting so the slot can be reclaimed
    entry.connected = false;
    registry[conn.id] = entry;
    await room.storage.put('team-registry', JSON.stringify(registry));

    room.broadcast(JSON.stringify({ type: 'team-registry-update', registry }), [conn.id]);
  },
};

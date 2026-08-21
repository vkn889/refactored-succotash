"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { useBRStore, type BRFighter, type BRItemEntity, type BRProjectile, type BRPhase } from "./storeBR";

// Battle Royale's own realtime relay — same host-authoritative Supabase
// Broadcast approach as lib/online.ts's 1v1 online mode, generalized from
// a fixed 2-slot pair to up to BR_MAX_PLAYERS clients, and kept on a
// completely separate channel namespace ("mogoff-br:" vs 1v1's "mogoff:")
// so the two modes can never collide or interfere with each other even if
// someone reused the same join code for both.
//
// Every connected client (host included) gets a random clientId once per
// session. The host assigns each new clientId a slot (0..7, host always
// slot 0) in join order via useBRStore's ensureSlot, applies every
// incoming input message to that slot's fighter, and broadcasts the whole
// BR store at ~15Hz. Every other client just applies that snapshot
// wholesale onto its own local store and never runs tick() itself.

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
    client = createClient(url, key);
  }
  return client;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateBRJoinCode(): string {
  let code = "";
  for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function channelName(code: string) {
  return `mogoff-br:${code}`;
}

function newClientId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `c-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export type BRInputMessage =
  // Sent once, immediately after a joiner connects — its only purpose is
  // to give the host something to receive so it assigns a slot (see
  // applyBRInputFor: ANY input message triggers ensureSlot). Without this,
  // a joiner would never get a slot at all: the character picker only
  // renders once a slot is assigned, so waiting for a real gameplay/claim
  // message to trigger that assignment is a deadlock.
  | { t: "hello" }
  | { t: "claim"; characterId: string }
  | { t: "move"; dir: -1 | 0 | 1 }
  | { t: "punch" }
  | { t: "kick" }
  | { t: "block"; on: boolean }
  | { t: "jump" }
  | { t: "special" };

interface BRWireInput {
  from: string;
  msg: BRInputMessage;
}

interface BRSnapshot {
  phase: BRPhase;
  fighters: BRFighter[];
  items: BRItemEntity[];
  projectiles: BRProjectile[];
  winnerSlot: number | null;
}

let activeChannel: RealtimeChannel | null = null;
let activeRole: "host" | "joiner" | null = null;
let broadcastInterval: number | null = null;
let localClientId: string | null = null;

/** Host-only: routes one incoming (or local) input message to the right
 * slot's store actions. */
function applyBRInputFor(clientId: string, msg: BRInputMessage) {
  const store = useBRStore.getState();
  const slot = store.ensureSlot(clientId);
  if (slot === null) return; // room's full
  switch (msg.t) {
    case "hello":
      break; // ensureSlot above already did the actual work
    case "claim":
      store.claimCharacter(slot, msg.characterId);
      break;
    case "move":
      store.setMoveDir(slot, msg.dir);
      break;
    case "punch":
      store.punch(slot);
      break;
    case "kick":
      store.kick(slot);
      break;
    case "block":
      store.setBlocking(slot, msg.on);
      break;
    case "jump":
      store.jump(slot);
      break;
    case "special":
      store.special(slot);
      break;
  }
}

function toSnapshot(): BRSnapshot {
  const s = useBRStore.getState();
  return { phase: s.phase, fighters: s.fighters, items: s.items, projectiles: s.projectiles, winnerSlot: s.winnerSlot };
}

/** Host: creates the room, claims slot 0 for itself, relays every other
 * client's input, and broadcasts the live store to everyone else. Presence
 * is used purely for the lobby's "N players connected" readout — actual
 * slot assignment/removal is driven by input/leave messages, not presence,
 * since presence only reports a headcount, not a stable identity. */
export function hostBRRoom(code: string): string {
  stopBROnline();
  localClientId = newClientId();
  const supabase = getClient();
  const channel = supabase.channel(channelName(code), { config: { broadcast: { self: false }, presence: { key: localClientId } } });

  channel.on("broadcast", { event: "input" }, ({ payload }) => {
    const { from, msg } = payload as BRWireInput;
    applyBRInputFor(from, msg);
  });
  channel.on("broadcast", { event: "leave" }, ({ payload }) => {
    useBRStore.getState().removeClient((payload as { from: string }).from);
  });
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") await channel.track({ role: "host", joinedAt: Date.now() });
  });

  activeChannel = channel;
  activeRole = "host";
  useBRStore.getState().setRoom(code, true, localClientId);
  useBRStore.getState().ensureSlot(localClientId); // host is always slot 0
  useBRStore.getState().setLocalSlot(0);

  broadcastInterval = window.setInterval(() => {
    channel.send({ type: "broadcast", event: "state", payload: toSnapshot() });
  }, 65);

  return localClientId;
}

/** Joiner: connects to an existing room, mirrors every incoming snapshot
 * onto the local store (except the local-only identity fields), and sends
 * its own input over the channel instead of calling store actions
 * directly — the host is the only one that ever actually simulates. */
export function joinBRRoom(code: string, onSlotAssigned: (slot: number) => void) {
  stopBROnline();
  localClientId = newClientId();
  const supabase = getClient();
  const channel = supabase.channel(channelName(code), { config: { broadcast: { self: false }, presence: { key: localClientId } } });

  channel.on("broadcast", { event: "state" }, ({ payload }) => {
    const snap = payload as BRSnapshot;
    useBRStore.getState().applySnapshot(snap);
    const mySlot = snap.fighters.find((f) => f.clientId === localClientId)?.slot;
    if (mySlot !== undefined && useBRStore.getState().localSlot !== mySlot) {
      useBRStore.getState().setLocalSlot(mySlot);
      onSlotAssigned(mySlot);
    }
  });
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await channel.track({ role: "joiner", joinedAt: Date.now() });
      sendBRInput({ t: "hello" });
    }
  });

  activeChannel = channel;
  activeRole = "joiner";
  useBRStore.getState().setRoom(code, false, localClientId);
}

/** Joiner-only input; the host applies its own local input directly via
 * useBRStore actions (see BattleRoyaleRoot's input wiring), so this is a
 * no-op when called from the host's own client. */
export function sendBRInput(msg: BRInputMessage) {
  if (!activeChannel || activeRole !== "joiner" || !localClientId) return;
  activeChannel.send({ type: "broadcast", event: "input", payload: { from: localClientId, msg } satisfies BRWireInput });
}

export function claimBRCharacter(characterId: string) {
  if (activeRole === "host" && localClientId) {
    applyBRInputFor(localClientId, { t: "claim", characterId });
  } else {
    sendBRInput({ t: "claim", characterId });
  }
}

export function getBRLocalClientId(): string | null {
  return localClientId;
}
export function getBRRole(): "host" | "joiner" | null {
  return activeRole;
}

export function stopBROnline() {
  if (broadcastInterval !== null) {
    window.clearInterval(broadcastInterval);
    broadcastInterval = null;
  }
  if (activeChannel) {
    if (activeRole === "joiner" && localClientId) {
      activeChannel.send({ type: "broadcast", event: "leave", payload: { from: localClientId } });
    }
    getClient().removeChannel(activeChannel);
    activeChannel = null;
    activeRole = null;
  }
  localClientId = null;
}

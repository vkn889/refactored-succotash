"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { useGameStore, type ActionState, type MatchPhase, type FinisherInfo } from "./store";
import type { Stance } from "./combat";

// Online multiplayer transport: Supabase Realtime Broadcast on a channel
// named by the join code. No database tables at all — broadcast messages
// are pure pub/sub over the websocket, never touch Postgres, so there's no
// schema/RLS to maintain for this.
//
// Host-authoritative: the host runs the real match simulation (same
// lib/store.ts tick() as any other match, with localMultiplayer:true so AI
// stays off) and broadcasts a throttled state snapshot ~20x/sec; the
// joiner runs no simulation of its own at all, just applies whatever the
// host last broadcast straight onto its own local store (see applyState
// below), and sends its own key presses over the channel as input
// messages instead of calling local store actions directly — the host
// applies those via the exact same punch2/kick2/move2/etc. actions local
// multiplayer's second keyboard already uses.

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

// No 0/O/1/I — easy to read aloud/type, five characters is enough entropy
// for a short-lived room code nobody's brute-forcing mid-match.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export type InputMessage =
  | { t: "move"; dir: -1 | 0 | 1 }
  | { t: "punch" }
  | { t: "kick" }
  | { t: "throw" }
  | { t: "block"; on: boolean }
  | { t: "crouch"; on: boolean }
  | { t: "jump" }
  | { t: "special" }
  // Joiner → host only, sent from CharacterSelect once the joiner locks in
  // their own fighter — see setOnlinePeerCharacterId. Not part of the
  // regular gameplay input set above; it's handled the same way (over the
  // "input" broadcast event) purely because that's already the joiner→host
  // channel, not because it's a gameplay action.
  | { t: "select"; characterId: string };

interface FighterSnapshot {
  characterId: string;
  health: number;
  maxHealth: number;
  meter: number;
  combo: number;
  action: ActionState;
  actionTimer: number;
  actionTotal: number;
  // Which stance (stand/crouch/air) the current punch/kick was thrown
  // from — needed so the joiner's mirrored pose renders a crouch sweep or
  // jump kick as itself instead of always falling back to the standing
  // animation (see lib/sprite2d.ts's computePose).
  attackStance: Stance | null;
  hitToken: number;
}

/** Everything the joiner needs to render the fight + HUD + result screens
 * without running its own simulation. */
interface StateSnapshot {
  phase: MatchPhase;
  playerId: string;
  opponentId: string;
  arenaId: string;
  playerX: number;
  opponentX: number;
  playerY: number;
  opponentY: number;
  player: FighterSnapshot;
  opponent: FighterSnapshot;
  matchTime: number;
  winner: "player" | "opponent" | "draw" | null;
  roundWins: { player: number; opponent: number };
  roundNumber: number;
  matchOver: boolean;
  screenShake: number;
  projectiles: { id: number; side: "player" | "opponent"; characterId: string; x: number; dir: 1 | -1; damage: number }[];
  comboCallout: { label: string; side: "player" | "opponent"; token: number } | null;
  // See FinisherInfo in lib/store.ts — the joiner mirrors the host's
  // finisher cutscene the same way it mirrors everything else, it just
  // never calls resolveFinisher() itself (see FightScreen.tsx); the
  // host's own eventual phase:"result" broadcast is what ends it for both
  // sides in sync.
  finisher: FinisherInfo | null;
}

let activeChannel: RealtimeChannel | null = null;
let activeRole: "host" | "joiner" | null = null;
let broadcastInterval: number | null = null;

function channelName(code: string) {
  return `mogoff:${code}`;
}

function toFighterSnapshot(f: ReturnType<typeof useGameStore.getState>["player"]): FighterSnapshot {
  return {
    characterId: f.characterId,
    health: f.health,
    maxHealth: f.maxHealth,
    meter: f.meter,
    combo: f.combo,
    action: f.action,
    actionTimer: f.actionTimer,
    actionTotal: f.actionTotal,
    attackStance: f.attackStance,
    hitToken: f.hitToken,
  };
}

/** Applies one incoming P2 input message (joiner → host) via the same
 * local-multiplayer P2 actions a second keyboard would call. */
function applyInput(msg: InputMessage) {
  const s = useGameStore.getState();
  switch (msg.t) {
    case "move":
      // Records the joiner's currently-held direction rather than nudging
      // the fighter once right here — tick() (lib/store.ts) applies it
      // continuously every host frame with the host's own real dt, the
      // same way a local second keyboard's movement gets applied, instead
      // of moving the fighter in one instant lump each time a message
      // happens to arrive (see joinerMoveDir's own comment for why that
      // used to read as visibly steppy motion).
      s.setJoinerMoveDir(msg.dir);
      break;
    case "punch":
      s.punch2();
      break;
    case "kick":
      s.kick2();
      break;
    case "throw":
      s.throw2();
      break;
    case "block":
      s.setBlocking2(msg.on);
      break;
    case "crouch":
      s.setCrouching2(msg.on);
      break;
    case "jump":
      s.jump2();
      break;
    case "special":
      s.special2();
      break;
    case "select":
      s.setOnlinePeerCharacterId(msg.characterId);
      break;
  }
}

/** Applies one incoming state snapshot (host → joiner) directly onto the
 * joiner's own local store — the joiner's store becomes a pure mirror,
 * never running tick() itself while online (see FightScreen/GameLoop2D). */
function applyState(snap: StateSnapshot) {
  useGameStore.setState({
    phase: snap.phase,
    playerId: snap.playerId,
    opponentId: snap.opponentId,
    arenaId: snap.arenaId,
    playerX: snap.playerX,
    opponentX: snap.opponentX,
    playerY: snap.playerY,
    opponentY: snap.opponentY,
    player: { ...useGameStore.getState().player, ...snap.player },
    opponent: { ...useGameStore.getState().opponent, ...snap.opponent },
    matchTime: snap.matchTime,
    winner: snap.winner,
    roundWins: snap.roundWins,
    roundNumber: snap.roundNumber,
    matchOver: snap.matchOver,
    screenShake: snap.screenShake,
    projectiles: snap.projectiles,
    comboCallout: snap.comboCallout,
    finisher: snap.finisher,
  });
}

/** Starts hosting: subscribes to the room, tracks presence so we can tell
 * when a second person joins, and wires incoming input straight into the
 * P2 store actions. Caller is responsible for actually starting the match
 * (goSelect(true) → normal versus flow) once onPeerJoined fires. */
export function startHosting(code: string, onPeerJoined: () => void, onPeerLeft: () => void) {
  stopOnline();
  const supabase = getClient();
  const channel = supabase.channel(channelName(code), { config: { broadcast: { self: false }, presence: { key: "host" } } });
  channel.on("broadcast", { event: "input" }, ({ payload }) => applyInput(payload as InputMessage));
  channel.on("presence", { event: "sync" }, () => {
    const count = Object.keys(channel.presenceState()).length;
    if (count >= 2) onPeerJoined();
    else onPeerLeft();
  });
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") await channel.track({ role: "host", joinedAt: Date.now() });
  });
  activeChannel = channel;
  activeRole = "host";

  // ~20Hz snapshot broadcast for the whole lifetime of the hosted session
  // (character select through result screens) — not tied to any one
  // mounted component, so navigating between screens doesn't interrupt it.
  broadcastInterval = window.setInterval(() => {
    const s = useGameStore.getState();
    const snap: StateSnapshot = {
      phase: s.phase,
      playerId: s.playerId,
      opponentId: s.opponentId,
      arenaId: s.arenaId,
      playerX: s.playerX,
      opponentX: s.opponentX,
      playerY: s.playerY,
      opponentY: s.opponentY,
      player: toFighterSnapshot(s.player),
      opponent: toFighterSnapshot(s.opponent),
      matchTime: s.matchTime,
      winner: s.winner,
      roundWins: s.roundWins,
      roundNumber: s.roundNumber,
      matchOver: s.matchOver,
      screenShake: s.screenShake,
      projectiles: s.projectiles,
      comboCallout: s.comboCallout,
      finisher: s.finisher,
    };
    channel.send({ type: "broadcast", event: "state", payload: snap });
  }, 50);
}

/** Starts joining an existing room. Incoming snapshots are applied
 * straight onto the local store (see applyState) — the caller doesn't
 * need to do anything with them, just react to the store like any other
 * screen already does. */
export function startJoining(code: string, onPeerJoined: () => void, onPeerLeft: () => void) {
  stopOnline();
  const supabase = getClient();
  const channel = supabase.channel(channelName(code), { config: { broadcast: { self: false }, presence: { key: "joiner" } } });
  channel.on("broadcast", { event: "state" }, ({ payload }) => applyState(payload as StateSnapshot));
  channel.on("presence", { event: "sync" }, () => {
    const count = Object.keys(channel.presenceState()).length;
    if (count >= 2) onPeerJoined();
    else onPeerLeft();
  });
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") await channel.track({ role: "joiner", joinedAt: Date.now() });
  });
  activeChannel = channel;
  activeRole = "joiner";
}

/** Joiner-side: send one input message to the host. No-op if we're not
 * currently a joiner (e.g. called stale after leaving). */
export function sendInput(msg: InputMessage) {
  if (!activeChannel || activeRole !== "joiner") return;
  activeChannel.send({ type: "broadcast", event: "input", payload: msg });
}

export function stopOnline() {
  if (broadcastInterval !== null) {
    window.clearInterval(broadcastInterval);
    broadcastInterval = null;
  }
  if (activeChannel) {
    getClient().removeChannel(activeChannel);
    activeChannel = null;
    activeRole = null;
  }
  // Defensive: if the joiner disconnected mid-swing, don't leave the host
  // stuck applying a stale held direction forever (see joinerMoveDir).
  useGameStore.getState().setJoinerMoveDir(0);
}

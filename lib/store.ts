"use client";

import { create } from "zustand";
import {
  getCharacter,
  getAttackMove,
  getSpecial,
  resolveDamage,
  meterAfterHit,
  TIMING,
  RANGE,
  STAGE,
  JUMP,
  PROJECTILE,
  BUILD_POWER,
  type AttackKind,
} from "./combat";
import { audio } from "./audio";
import { ARENAS } from "./arenas";
import { STORY_LADDER } from "./story";
import { loadStorySave, saveStoryProgress, clearStorySave } from "./storySave";

export type MatchPhase =
  | "home"
  | "select"
  | "story_intro"
  | "story_select"
  | "multiplayer_menu"
  | "online_lobby"
  | "fight"
  | "result";
export type ActionState =
  | "idle"
  | "walk"
  | "crouch"
  | "punch"
  | "kick"
  | "block"
  | "hitstun"
  | "special"
  | "cooldown"
  | "ko";

export interface FighterRuntime {
  characterId: string;
  health: number;
  maxHealth: number;
  meter: number;
  combo: number;
  action: ActionState;
  actionTimer: number; // ms remaining in current action phase
  actionTotal: number; // ms total duration of current action (for progress bars)
  /** Increments on every landed, non-blocked hit this fighter takes —
   * Fighter2D watches this to trigger a knockback/flash impulse. */
  hitToken: number;
}

export interface HitEvent {
  id: number;
  kind: "punch" | "kick" | "special" | "block";
  side: "player" | "opponent";
  t: number;
}

/** A traveling elemental projectile special — see fireSpecial. */
export interface Projectile {
  id: number;
  side: "player" | "opponent";
  characterId: string;
  x: number;
  dir: 1 | -1;
  damage: number;
}

interface GameState {
  phase: MatchPhase;
  playerId: string;
  opponentId: string;
  arenaId: string;
  playerX: number;
  opponentX: number;
  playerY: number; // jump height above ground, 0 = grounded
  playerVelY: number;
  opponentY: number;
  opponentVelY: number;
  matchTime: number; // seconds remaining
  winner: "player" | "opponent" | "draw" | null; // this ROUND's outcome
  roundWins: { player: number; opponent: number };
  roundNumber: number; // 1-indexed
  matchOver: boolean; // true once either side has won ROUNDS_TO_WIN rounds
  hitStop: number; // ms of freeze-frame remaining, classic fighting-game impact punch
  screenShake: number; // 0..1 decaying
  player: FighterRuntime;
  opponent: FighterRuntime;
  hitEvents: HitEvent[];
  projectiles: Projectile[];
  musicUnlocked: boolean;
  paused: boolean;
  tutorialSeen: boolean;
  showTutorial: boolean;

  // --- online multiplayer (see lib/online.ts, components/game/OnlineBridge.tsx) ---
  // "host" runs the real simulation (tick/AI-off, same as localMultiplayer)
  // and broadcasts state; "joiner" runs no simulation at all and just
  // mirrors whatever state the host broadcasts. Neither role touches the
  // actual realtime connection object, which lives outside React state in
  // lib/online.ts (a WebSocket channel isn't serializable store data).
  onlineRole: "host" | "joiner" | null;
  onlineCode: string | null;
  setOnlineRole: (role: "host" | "joiner" | null, code?: string | null) => void;

  // --- story mode ---
  storyActive: boolean;
  storyIndex: number; // index into STORY_LADDER of the fight currently in progress
  storyPlayerId: string | null;

  // --- local same-keyboard 2P: opponent is human-controlled (see
  // components/game/LocalMultiplayerInput.tsx) instead of AI. Online
  // multiplayer is a separate mode (see lib/online.ts) that doesn't touch
  // this flag. ---
  localMultiplayer: boolean;

  // --- lifecycle ---
  goHome: () => void;
  goSelect: (localMultiplayer?: boolean) => void;
  goStoryIntro: () => void; // "The Great Mog Off" New Game / Load Game landing screen
  goStorySelect: () => void;
  goMultiplayerMenu: () => void; // local vs online choice
  goOnlineLobby: () => void; // host/join-code screen
  startMatch: (playerId: string, opponentId: string, arenaId?: string) => void;
  nextRound: () => void; // called after a non-final round ends — same match, next round
  startStoryRun: (playerId: string) => void; // New Game — clears any existing save
  resumeStoryRun: () => boolean; // Load Game — returns false if there's nothing to resume
  advanceStory: () => void; // called after a story-mode win — next fight, or run complete
  endStoryRun: () => void;
  restartMatch: () => void;
  setPaused: (p: boolean) => void;
  dismissTutorial: () => void;
  openTutorial: () => void;

  // --- player 1 input ---
  punch: () => void;
  kick: () => void;
  setBlocking: (on: boolean) => void;
  setCrouching: (on: boolean) => void;
  jump: () => void;
  special: () => void;
  move: (dir: -1 | 0 | 1, dtSec: number) => void;

  // --- player 2 input (local multiplayer only — controls the opponent
  // side directly instead of AI; see localMultiplayer above) ---
  punch2: () => void;
  kick2: () => void;
  setBlocking2: (on: boolean) => void;
  setCrouching2: (on: boolean) => void;
  jump2: () => void;
  special2: () => void;
  move2: (dir: -1 | 0 | 1, dtSec: number) => void;

  // --- sim ---
  tick: (dtMs: number) => void;
}

const HIT_ID = { current: 1 };
function nextHitId() {
  return HIT_ID.current++;
}
const PROJECTILE_ID = { current: 1 };
function nextProjectileId() {
  return PROJECTILE_ID.current++;
}

function freshFighter(characterId: string): FighterRuntime {
  const c = getCharacter(characterId);
  return {
    characterId,
    health: c.health,
    maxHealth: c.health,
    meter: 0,
    combo: 0,
    action: "idle",
    actionTimer: 0,
    actionTotal: 0,
    hitToken: 0,
  };
}

const START_PLAYER_X = -2.6;
const START_OPPONENT_X = 2.6;
const ROUNDS_TO_WIN = 2; // best of three

function readTutorialSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem("mogoff_tutorial_seen") === "1";
  } catch {
    return false;
  }
}

// Shared helper signatures matching what Zustand's `create` callback hands
// us, so the free functions below (attemptAttack/resolveAttack/fireSpecial/
// runAI) don't need to be inlined into the store just to get proper types.
type SetFn = (
  partial: Partial<GameState> | ((s: GameState) => Partial<GameState> | GameState),
  replace?: false
) => void;
type GetFn = () => GameState;

function attackTiming(kind: AttackKind, characterId?: string) {
  const t = TIMING[kind];
  const speed = characterId ? BUILD_POWER[getCharacter(characterId).build].speed : 1;
  const scale = (ms: number) => Math.round(ms / speed);
  return { total: scale(t.windup + t.active + t.recovery) };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Keep a fighter inside the stage and never fully overlapping the other
 * fighter, without changing the direction they were trying to move in. */
function resolveMoveX(nextX: number, otherX: number): number {
  const bound = STAGE.width / 2 - STAGE.margin;
  let x = clamp(nextX, -bound, bound);
  if (Math.abs(x - otherX) < STAGE.minSeparation) {
    x = otherX + Math.sign(x - otherX || 1) * STAGE.minSeparation;
    x = clamp(x, -bound, bound);
  }
  return x;
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: "home",
  playerId: "gautham",
  opponentId: "garv",
  arenaId: ARENAS.fire.id,
  playerX: START_PLAYER_X,
  opponentX: START_OPPONENT_X,
  playerY: 0,
  playerVelY: 0,
  opponentY: 0,
  opponentVelY: 0,
  matchTime: 99,
  winner: null,
  roundWins: { player: 0, opponent: 0 },
  roundNumber: 1,
  matchOver: false,
  hitStop: 0,
  screenShake: 0,
  player: freshFighter("gautham"),
  opponent: freshFighter("garv"),
  hitEvents: [],
  projectiles: [],
  musicUnlocked: false,
  paused: false,
  tutorialSeen: readTutorialSeen(),
  showTutorial: false,

  onlineRole: null,
  onlineCode: null,
  setOnlineRole: (role, code = null) => set({ onlineRole: role, onlineCode: code }),

  storyActive: false,
  storyIndex: 0,
  storyPlayerId: null,
  localMultiplayer: false,

  goHome: () =>
    set({ phase: "home", storyActive: false, storyIndex: 0, storyPlayerId: null, localMultiplayer: false, onlineRole: null, onlineCode: null }),
  goSelect: (localMultiplayer = false) =>
    set({ phase: "select", storyActive: false, storyIndex: 0, storyPlayerId: null, localMultiplayer }),
  goStoryIntro: () => set({ phase: "story_intro" }),
  goStorySelect: () => set({ phase: "story_select" }),
  goMultiplayerMenu: () => set({ phase: "multiplayer_menu" }),
  goOnlineLobby: () => set({ phase: "online_lobby" }),

  startStoryRun: (playerId) => {
    clearStorySave(); // New Game always starts a fresh save, overwriting any prior run
    saveStoryProgress({ playerId, storyIndex: 0 });
    set({ storyActive: true, storyIndex: 0, storyPlayerId: playerId });
    const firstOpponent = STORY_LADDER[0];
    get().startMatch(playerId, firstOpponent, getCharacter(firstOpponent).arenaId);
  },

  resumeStoryRun: () => {
    const save = loadStorySave();
    if (!save || !STORY_LADDER[save.storyIndex]) return false;
    set({ storyActive: true, storyIndex: save.storyIndex, storyPlayerId: save.playerId });
    const opponent = STORY_LADDER[save.storyIndex];
    get().startMatch(save.playerId, opponent, getCharacter(opponent).arenaId);
    return true;
  },

  advanceStory: () => {
    const s = get();
    if (!s.storyActive || !s.storyPlayerId) return;
    const nextIndex = s.storyIndex + 1;
    const nextOpponent = STORY_LADDER[nextIndex];
    if (!nextOpponent) {
      // Ladder complete — stay on the result screen; ResultScreen shows the
      // ending. Nothing left to start, and nothing left to resume either.
      clearStorySave();
      set({ storyIndex: nextIndex });
      return;
    }
    saveStoryProgress({ playerId: s.storyPlayerId, storyIndex: nextIndex });
    set({ storyIndex: nextIndex });
    get().startMatch(s.storyPlayerId, nextOpponent, getCharacter(nextOpponent).arenaId);
  },

  endStoryRun: () => set({ storyActive: false, storyIndex: 0, storyPlayerId: null }),

  startMatch: (playerId, opponentId, arenaId) => {
    const resolvedArena = arenaId ?? getCharacter(playerId).arenaId;
    audio.playMusic("fighting");
    audio.playAmbient(ARENAS[resolvedArena]?.ambientTrack ?? resolvedArena);
    const tutorialSeen = get().tutorialSeen;
    aiClock = 0;
    aiNextDecision = 0;
    aiRangeUntil = 0;
    set({
      phase: "fight",
      playerId,
      opponentId,
      arenaId: resolvedArena,
      playerX: START_PLAYER_X,
      opponentX: START_OPPONENT_X,
      playerY: 0,
      playerVelY: 0,
      opponentY: 0,
      opponentVelY: 0,
      matchTime: 99,
      winner: null,
      roundWins: { player: 0, opponent: 0 },
      roundNumber: 1,
      matchOver: false,
      hitStop: 0,
      screenShake: 0,
      player: freshFighter(playerId),
      opponent: freshFighter(opponentId),
      hitEvents: [],
      projectiles: [],
      paused: !tutorialSeen,
      showTutorial: !tutorialSeen,
    });
  },

  // Same match, next round: keeps roundWins/roundNumber (already advanced
  // by tick()'s winner-detection block) and playerId/opponentId/arenaId,
  // just resets health/position/timer — FightScreen skips straight back to
  // a short "ROUND N" countdown instead of replaying the matchup intro.
  nextRound: () => {
    const s = get();
    audio.playMusic("fighting");
    audio.playAmbient(ARENAS[s.arenaId]?.ambientTrack ?? s.arenaId);
    aiClock = 0;
    aiNextDecision = 0;
    aiRangeUntil = 0;
    set({
      phase: "fight",
      roundNumber: s.roundNumber + 1,
      playerX: START_PLAYER_X,
      opponentX: START_OPPONENT_X,
      playerY: 0,
      playerVelY: 0,
      opponentY: 0,
      opponentVelY: 0,
      matchTime: 99,
      winner: null,
      hitStop: 0,
      screenShake: 0,
      player: freshFighter(s.playerId),
      opponent: freshFighter(s.opponentId),
      hitEvents: [],
      projectiles: [],
      paused: false,
    });
  },

  restartMatch: () => {
    const { playerId, opponentId, arenaId } = get();
    get().startMatch(playerId, opponentId, arenaId);
  },

  setPaused: (p) => set({ paused: p }),

  dismissTutorial: () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("mogoff_tutorial_seen", "1");
      } catch {
        /* ignore */
      }
    }
    set({ showTutorial: false, tutorialSeen: true });
  },

  openTutorial: () => set({ showTutorial: true, paused: true }),

  punch: () => attemptAttack(set, get, "punch"),
  kick: () => attemptAttack(set, get, "kick"),

  setBlocking: (on) =>
    set((s) => {
      if (on) {
        if (s.player.action !== "idle" && s.player.action !== "walk" && s.player.action !== "crouch") return {};
        return { player: { ...s.player, action: "block", actionTimer: 0, actionTotal: 0 } };
      }
      if (s.player.action !== "block") return {};
      return { player: { ...s.player, action: "idle", actionTimer: 0, actionTotal: 0 } };
    }),

  setCrouching: (on) =>
    set((s) => {
      if (on) {
        if (s.player.action !== "idle" && s.player.action !== "walk") return {};
        return { player: { ...s.player, action: "crouch", actionTimer: 0, actionTotal: 0 } };
      }
      if (s.player.action !== "crouch") return {};
      return { player: { ...s.player, action: "idle", actionTimer: 0, actionTotal: 0 } };
    }),

  jump: () =>
    set((s) => {
      if (s.phase !== "fight" || s.paused) return {};
      if (s.playerY > 0.02) return {}; // already airborne
      if (!(s.player.action === "idle" || s.player.action === "walk" || s.player.action === "crouch")) return {};
      audio.unlock();
      return { playerVelY: JUMP.velocity };
    }),

  special: () => fireSpecial(set, get, "player"),

  // Single horizontal axis, camera-free: dir is -1 (toward own left) or 1
  // (toward own right) on screen. Blocking/crouching hold you in place,
  // same as every other side-view fighter.
  move: (dir, dtSec) =>
    set((s) => {
      if (s.phase !== "fight" || s.paused || dir === 0) return {};
      if (!(s.player.action === "idle" || s.player.action === "walk")) return {};
      const speed = RANGE.moveSpeed * dtSec;
      const nextX = resolveMoveX(s.playerX + dir * speed, s.opponentX);
      return { playerX: nextX, player: { ...s.player, action: "walk" } };
    }),

  // --- player 2 (local multiplayer) — same rules as the P1 versions
  // above, just targeting the opponent side's fields directly instead of
  // going through AI. resolveAttack/fireSpecial already take a side
  // param, so combat itself is shared; only the input-gating/movement
  // logic (which has no shared side-agnostic form, since player/opponent
  // live as separate named fields rather than a side-keyed map) is
  // duplicated here.
  punch2: () => attemptAttack2(set, get, "punch"),
  kick2: () => attemptAttack2(set, get, "kick"),

  setBlocking2: (on) =>
    set((s) => {
      if (on) {
        if (s.opponent.action !== "idle" && s.opponent.action !== "walk" && s.opponent.action !== "crouch") return {};
        return { opponent: { ...s.opponent, action: "block", actionTimer: 0, actionTotal: 0 } };
      }
      if (s.opponent.action !== "block") return {};
      return { opponent: { ...s.opponent, action: "idle", actionTimer: 0, actionTotal: 0 } };
    }),

  setCrouching2: (on) =>
    set((s) => {
      if (on) {
        if (s.opponent.action !== "idle" && s.opponent.action !== "walk") return {};
        return { opponent: { ...s.opponent, action: "crouch", actionTimer: 0, actionTotal: 0 } };
      }
      if (s.opponent.action !== "crouch") return {};
      return { opponent: { ...s.opponent, action: "idle", actionTimer: 0, actionTotal: 0 } };
    }),

  jump2: () =>
    set((s) => {
      if (s.phase !== "fight" || s.paused) return {};
      if (s.opponentY > 0.02) return {};
      if (!(s.opponent.action === "idle" || s.opponent.action === "walk" || s.opponent.action === "crouch")) return {};
      audio.unlock();
      return { opponentVelY: JUMP.velocity };
    }),

  special2: () => fireSpecial(set, get, "opponent"),

  move2: (dir, dtSec) =>
    set((s) => {
      if (s.phase !== "fight" || s.paused || dir === 0) return {};
      if (!(s.opponent.action === "idle" || s.opponent.action === "walk")) return {};
      const speed = RANGE.moveSpeed * dtSec;
      const nextX = resolveMoveX(s.opponentX + dir * speed, s.playerX);
      return { opponentX: nextX, opponent: { ...s.opponent, action: "walk" } };
    }),

  tick: (dtMs) => {
    const s = get();
    if (s.phase !== "fight" || s.paused) return;

    if (s.hitStop > 0) {
      set({ hitStop: Math.max(0, s.hitStop - dtMs) });
      return;
    }

    const matchTime = Math.max(0, s.matchTime - dtMs / 1000);
    const screenShake = Math.max(0, s.screenShake - dtMs * 0.004);

    const dt = dtMs / 1000;
    let playerY = s.playerY;
    let playerVelY = s.playerVelY;
    if (playerY > 0 || playerVelY !== 0) {
      playerVelY -= JUMP.gravity * dt;
      playerY = Math.max(0, playerY + playerVelY * dt);
      if (playerY === 0) playerVelY = 0;
    }
    let opponentY = s.opponentY;
    let opponentVelY = s.opponentVelY;
    if (opponentY > 0 || opponentVelY !== 0) {
      opponentVelY -= JUMP.gravity * dt;
      opponentY = Math.max(0, opponentY + opponentVelY * dt);
      if (opponentY === 0) opponentVelY = 0;
    }

    // A player who stops pressing a movement key just reverts to idle next
    // tick since move() is only called while a key is actually held —
    // nothing here needs to detect "stopped moving" itself.
    let player = stepFighter(s.player, dtMs);
    let opponent = stepFighter(s.opponent, dtMs);
    if (player.action === "walk") player = { ...player, action: "idle" };
    if (opponent.action === "walk") opponent = { ...opponent, action: "idle" };

    let winner = s.winner;
    let phase: MatchPhase = s.phase;
    if (player.health <= 0 && !winner) {
      winner = "opponent";
      player.action = "ko";
    }
    if (opponent.health <= 0 && !winner) {
      winner = "player";
      opponent.action = "ko";
    }
    if (matchTime <= 0 && !winner) {
      winner = player.health === opponent.health ? "draw" : player.health > opponent.health ? "player" : "opponent";
    }
    // A draw replays the same round (no round win awarded to either side)
    // rather than advancing the match — everything else about a round
    // ending is identical either way.
    let roundWins = s.roundWins;
    let matchOver = s.matchOver;
    if (winner && winner !== "draw") {
      roundWins = { ...s.roundWins, [winner]: s.roundWins[winner] + 1 };
      matchOver = roundWins.player >= ROUNDS_TO_WIN || roundWins.opponent >= ROUNDS_TO_WIN;
    }
    if (winner) {
      phase = "result";
      // Only swap back to the home theme once the whole match is decided —
      // between rounds (matchOver still false) the battle music keeps
      // playing straight through the round-transition screen instead of
      // blipping back to the theme for the ~2s before nextRound() resumes it.
      if (matchOver) {
        audio.stopAmbient();
        audio.playMusic("theme");
      }
    }

    set({ matchTime, screenShake, playerY, playerVelY, opponentY, opponentVelY, player, opponent, phase, winner, roundWins, matchOver });

    stepProjectiles(set, get, dtMs);
    // A human at the keyboard controls the opponent side directly in local
    // multiplayer (see punch2/kick2/move2/etc. above) — AI would otherwise
    // fight the second player for control of the same fighter.
    if (!s.localMultiplayer) runAI(set, get, dtMs);
  },
}));

// stepFighter only advances the CURRENT action's own timer — it doesn't
// know about "walk", which move() sets fresh every tick it's called; tick()
// above reverts a stale "walk" back to "idle" the moment move() stops being
// called for a frame, matching the old 3D version's identical pattern.
function stepFighter(f: FighterRuntime, dtMs: number): FighterRuntime {
  if (f.action === "idle" || f.action === "walk" || f.action === "crouch" || f.action === "block" || f.action === "ko") {
    return f;
  }
  const timer = f.actionTimer - dtMs;
  if (timer > 0) return { ...f, actionTimer: timer };
  return { ...f, action: "idle", actionTimer: 0, actionTotal: 0 };
}

function attemptAttack(set: SetFn, get: GetFn, kind: AttackKind) {
  const s = get();
  if (s.phase !== "fight" || s.paused) return;
  if (s.player.action !== "idle" && s.player.action !== "walk" && s.player.action !== "crouch") return;
  const timing = attackTiming(kind, s.playerId);
  audio.unlock();

  // Resolve the hit THIS SAME TICK, using positions as they are right now —
  // no delayed re-check. The windup/recovery timing still runs for the
  // swing animation, but it's purely cosmetic and never gates whether the
  // hit landed (see the note at the top of lib/combat.ts).
  set({
    player: { ...s.player, action: kind, actionTimer: timing.total, actionTotal: timing.total },
  });
  resolveAttack(set, get, "player", kind);
}

/** Local-multiplayer P2's punch/kick — same instant-resolve rule as P1's
 * attemptAttack, just targeting the opponent side (a real second player,
 * not AI, when this is ever called — see localMultiplayer). */
function attemptAttack2(set: SetFn, get: GetFn, kind: AttackKind) {
  const s = get();
  if (s.phase !== "fight" || s.paused) return;
  if (s.opponent.action !== "idle" && s.opponent.action !== "walk" && s.opponent.action !== "crouch") return;
  const timing = attackTiming(kind, s.opponentId);
  audio.unlock();
  set({
    opponent: { ...s.opponent, action: kind, actionTimer: timing.total, actionTotal: timing.total },
  });
  resolveAttack(set, get, "opponent", kind);
}

function resolveAttack(set: SetFn, get: GetFn, side: "player" | "opponent", kind: AttackKind) {
  const s = get();
  const attacker = side === "player" ? s.player : s.opponent;
  const defender = side === "player" ? s.opponent : s.player;
  const attackerId = side === "player" ? s.playerId : s.opponentId;
  const defenderMove = defender.action;

  const attackerX = side === "player" ? s.playerX : s.opponentX;
  const defenderX = side === "player" ? s.opponentX : s.playerX;
  if (Math.abs(defenderX - attackerX) > RANGE.reach) return;

  const move = getAttackMove(attackerId, kind);
  const blocking = defenderMove === "block";
  const dmg = resolveDamage(move.damage, blocking, side === "opponent");

  const newHealth = clamp(defender.health - dmg, 0, defender.maxHealth);
  const newAttackerMeter = meterAfterHit(attacker.meter, move.meterGain);
  const hitstun = kind === "punch" ? TIMING.hitstun_punch : TIMING.hitstun_kick;

  audio.playSfx(blocking ? "block" : kind === "kick" ? "hit_heavy" : "hit_light");
  if (attacker.meter < 100 && newAttackerMeter >= 100) audio.playSfx("meter_full");

  const defenderPatch: Partial<FighterRuntime> = blocking
    ? { health: newHealth }
    : { health: newHealth, action: "hitstun", actionTimer: hitstun, actionTotal: hitstun, hitToken: defender.hitToken + 1, combo: 0 };

  if (side === "player") {
    set({
      opponent: { ...defender, ...defenderPatch },
      player: { ...attacker, meter: newAttackerMeter, combo: attacker.combo + 1 },
      screenShake: kind === "kick" ? 0.4 : 0.2,
      hitStop: blocking ? 0 : kind === "kick" ? 90 : 45,
    });
  } else {
    set({
      player: { ...defender, ...defenderPatch },
      opponent: { ...attacker, meter: newAttackerMeter, combo: attacker.combo + 1 },
      screenShake: kind === "kick" ? 0.4 : 0.2,
      hitStop: blocking ? 0 : kind === "kick" ? 90 : 45,
    });
  }
  pushHitEvent(set, get, blocking ? "block" : kind, side);
}

function pushHitEvent(set: SetFn, get: GetFn, kind: HitEvent["kind"], side: HitEvent["side"]) {
  const s = get();
  const events = [...s.hitEvents, { id: nextHitId(), kind, side, t: performance.now() }].slice(-12);
  set({ hitEvents: events });
}

/** Meter-gated finisher: an instant close-range burst, or a traveling
 * projectile — see MoveConfig.projectile in lib/types.ts. Same
 * instant-resolve-on-windup-end discipline as a normal punch/kick, just on
 * a longer, more dramatic timer (TIMING.specialWindup) with a hit-stop +
 * screen-shake flourish since this is meant to read as the "finisher." */
function fireSpecial(set: SetFn, get: GetFn, side: "player" | "opponent") {
  const s = get();
  const fighter = side === "player" ? s.player : s.opponent;
  const characterId = side === "player" ? s.playerId : s.opponentId;
  if (fighter.meter < 100) return;
  if (fighter.action !== "idle" && fighter.action !== "walk" && fighter.action !== "crouch") return;
  const move = getSpecial(characterId);

  set({
    [side]: { ...fighter, action: "special", actionTimer: TIMING.specialWindup, actionTotal: TIMING.specialWindup },
  });
  audio.playSfx("charge_rumble");
  audio.playVoiceLine(characterId);

  window.setTimeout(() => {
    const cur = get();
    if (cur.phase !== "fight") return;
    audio.playSfx("special_release");
    pushHitEvent(set, get, "special", side);

    if (move.projectile) {
      const attackerX = side === "player" ? cur.playerX : cur.opponentX;
      const dir: 1 | -1 = side === "player" ? (cur.opponentX >= attackerX ? 1 : -1) : cur.playerX >= attackerX ? 1 : -1;
      set({
        projectiles: [
          ...cur.projectiles,
          { id: nextProjectileId(), side, characterId, x: attackerX, dir, damage: move.damage },
        ],
      });
    } else {
      const attackerX = side === "player" ? cur.playerX : cur.opponentX;
      const defenderX = side === "player" ? cur.opponentX : cur.playerX;
      if (Math.abs(defenderX - attackerX) <= RANGE.specialReach) {
        applySpecialHit(set, get, side, move.damage);
      }
    }

    const after = get();
    const attackerNow = side === "player" ? after.player : after.opponent;
    set({
      [side]: { ...attackerNow, action: "cooldown", actionTimer: TIMING.cooldown, actionTotal: TIMING.cooldown, meter: 0 },
    });
  }, TIMING.specialWindup);
}

function applySpecialHit(set: SetFn, get: GetFn, side: "player" | "opponent", damage: number) {
  const s = get();
  const defender = side === "player" ? s.opponent : s.player;
  const blocking = defender.action === "block";
  const dmg = resolveDamage(damage, blocking, side === "opponent");
  const newHealth = clamp(defender.health - dmg, 0, defender.maxHealth);
  const patch: Partial<FighterRuntime> = blocking
    ? { health: newHealth }
    : { health: newHealth, action: "hitstun", actionTimer: TIMING.hitstun_kick, actionTotal: TIMING.hitstun_kick, hitToken: defender.hitToken + 1, combo: 0 };
  set({
    [side === "player" ? "opponent" : "player"]: { ...defender, ...patch },
    screenShake: 1,
    hitStop: blocking ? 60 : 160,
  });
}

function stepProjectiles(set: SetFn, get: GetFn, dtMs: number) {
  const s = get();
  if (s.projectiles.length === 0) return;
  const dt = dtMs / 1000;
  const bound = STAGE.width / 2;
  const remaining: Projectile[] = [];
  let hitSide: "player" | "opponent" | null = null;
  let hitDamage = 0;

  for (const p of s.projectiles) {
    const x = p.x + p.dir * PROJECTILE.speed * dt;
    const targetX = p.side === "player" ? get().opponentX : get().playerX;
    if (Math.abs(x - targetX) <= PROJECTILE.hitRadius) {
      hitSide = p.side;
      hitDamage = p.damage;
      continue; // consumed on hit
    }
    if (x < -bound - 1 || x > bound + 1) continue; // flew off stage — miss
    remaining.push({ ...p, x });
  }

  if (hitSide) applySpecialHit(set, get, hitSide, hitDamage);
  set({ projectiles: remaining });
}

// --- Opponent AI: independent movement + punch/kick/block/jump/special
// decisions along the single stage axis. ---
let aiNextDecision = 0;
let aiClock = 0;
// Alternates between brawling in close and hanging back, rather than
// always beelining to melee distance.
let aiPreferredRange = 1.2;
let aiRangeUntil = 0;

function runAI(set: SetFn, get: GetFn, dtMs: number) {
  aiClock += dtMs;
  const s = get();
  if (s.opponent.action === "ko" || s.player.action === "ko") return;

  if (aiClock > aiRangeUntil) {
    aiRangeUntil = aiClock + 2500 + Math.random() * 3500;
    aiPreferredRange = Math.random() < 0.55 ? 1.1 : 3 + Math.random() * 4;
  }

  // Independent steering: approach/retreat toward a preferred spacing.
  if (s.opponent.action === "idle" || s.opponent.action === "walk") {
    const d = s.playerX - s.opponentX;
    const dist = Math.abs(d);
    const toward = Math.sign(d) || 1;
    const radial = dist > aiPreferredRange + 0.4 ? toward : dist < aiPreferredRange - 0.4 ? -toward : 0;
    if (radial !== 0) {
      const speed = RANGE.aiSpeed * (dtMs / 1000);
      const nextX = resolveMoveX(s.opponentX + radial * speed, s.playerX);
      set({ opponentX: nextX, opponent: { ...get().opponent, action: "walk" } });
    }
  }

  if (aiClock < aiNextDecision) return;
  aiNextDecision = aiClock + 300 + Math.random() * 400;

  const cur = get();
  if (cur.opponent.action !== "idle") return;

  const d = Math.abs(cur.opponentX - cur.playerX);
  const inMelee = d <= RANGE.reach;
  const roll = Math.random();

  // charge special when meter full
  if (cur.opponent.meter >= 100 && roll < 0.6) {
    fireSpecial(set, get, "opponent");
    return;
  }

  if (cur.player.action === "punch" || cur.player.action === "kick") {
    if (inMelee && roll < 0.4) {
      set({ opponent: { ...cur.opponent, action: "block" } });
      window.setTimeout(() => {
        const c3 = get();
        if (c3.phase === "fight" && c3.opponent.action === "block") set({ opponent: { ...c3.opponent, action: "idle" } });
      }, 400 + Math.random() * 250);
      return;
    }
  }

  if (!inMelee && roll < 0.12 && cur.opponentY <= 0.02) {
    set({ opponentVelY: JUMP.velocity });
    return;
  }

  if (inMelee && roll < 0.85) {
    const kind: AttackKind = roll < 0.55 ? "punch" : "kick";
    const timing = attackTiming(kind, cur.opponentId);
    set({
      opponent: { ...cur.opponent, action: kind, actionTimer: timing.total, actionTotal: timing.total },
    });
    resolveAttack(set, get, "opponent", kind);
  }
}

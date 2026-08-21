"use client";

import { create } from "zustand";
import {
  getCharacter,
  getAttackMove,
  getThrowMove,
  getSpecial,
  resolveDamage,
  meterAfterHit,
  moveSpeedFor,
  elementEffectFor,
  TIMING,
  RANGE,
  STAGE,
  JUMP,
  PROJECTILE,
  COMBOS,
  COMBO_WINDOW_MS,
  COMBO_SCALING,
  COMEBACK,
  PARRY,
  BASE_KNOCKBACK,
  type AttackKind,
  type AttackProfile,
  type ComboDef,
  type Stance,
} from "./combat";
import { audio } from "./audio";
import { ARENAS } from "./arenas";
import { STORY_LADDER } from "./story";
import { loadStorySave, saveStoryProgress, clearStorySave } from "./storySave";
import { DIFFICULTIES, readDifficulty, saveDifficulty, type DifficultyId } from "./difficulty";

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
  | "throw"
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
  /** Which stance the current punch/kick was thrown from (see Stance in
   * lib/combat.ts) — set the instant the attack is thrown and read back by
   * selectSprite (lib/spriteAtlas.ts) for the rest of that attack's animation,
   * so a crouching sweep/jump kick actually looks different from a standing
   * one instead of just hitting different for the same animation. Only
   * meaningful while action is "punch"/"kick"; null otherwise. */
  attackStance: Stance | null;
  /** Increments on every landed, non-blocked hit this fighter takes —
   * Fighter2D watches this to trigger a knockback/flash impulse. */
  hitToken: number;
  // --- elemental status (see ELEMENT_EFFECTS in lib/combat.ts) ---
  /** Fire's damage-over-time: ticksLeft counts down once per burnTickTimer
   * expiry (processed in tick()), independent of this fighter's own
   * action/hitstun — burning keeps ticking even through a block. */
  burnTicksLeft: number;
  burnTickTimer: number; // ms until the next tick
  burnDamage: number; // chip damage applied per tick
  /** Ice's slow: while slowMsLeft > 0, this fighter's own move speed is
   * multiplied by slowFactor (read in move/move2/runAI's speed calc). */
  slowMsLeft: number;
  slowFactor: number;
}

/** Set once, on the actual match-deciding blow (see tick()'s winner/
 * matchOver block) — FightScreen renders FinisherSequence.tsx while this
 * is non-null instead of letting the normal phase:"result" transition
 * happen immediately, so the winner's finishing blow gets one dramatic
 * beat before the scoreboard. `kind:"special"` (the blow was a meter
 * special — every character's `moves.special.cinematic` flag exists for
 * exactly this) gets the bigger, longer treatment; `kind:"normal"` (any
 * other match-ending hit — a plain punch/kick, a combo finisher, or a
 * throw) still gets a real beat, just a shorter/simpler one. */
export interface FinisherInfo {
  winnerSide: "player" | "opponent";
  kind: "special" | "normal";
  moveName: string;
}

export interface HitEvent {
  id: number;
  kind: "punch" | "kick" | "special" | "block";
  side: "player" | "opponent";
  t: number;
  /** Actual damage dealt (0 for a pure release-timing event like a
   * special's own hit-event, which fires on windup-end rather than
   * confirmed connect) — Stage2D.tsx uses this for the floating
   * damage-number popup and to size the hit-spark burst. */
  damage: number;
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
  /** Air jumps used since last touching the ground — 0 or 1. A double jump
   * is just a second jump() call permitted once while already airborne (see
   * the jump/jump2 actions below); resets to 0 the instant either fighter
   * lands (see tick()). Online joiners never read these locally (the host's
   * broadcast state is what they render), so they don't need to be part of
   * the network snapshot in lib/online.ts. */
  playerAirJumps: number;
  opponentAirJumps: number;
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
  /** The most recent landed combo finisher (see COMBOS in lib/combat.ts),
   * for HUD.tsx's callout flash — `token` increments every time so the
   * same combo id landing twice in a row still re-triggers the animation
   * (a plain string/id wouldn't, since React state "changing" to the same
   * value doesn't re-fire an effect). Null when no callout is showing. */
  comboCallout: { label: string; side: "player" | "opponent"; token: number } | null;
  /** Non-null exactly while FinisherSequence.tsx is holding the screen for
   * the match-deciding blow — see FinisherInfo and tick()'s winner/
   * matchOver block. `resolveFinisher()` is what actually flips phase to
   * "result" once the cutscene is done; tick() itself withholds that
   * transition while this is set. */
  finisher: FinisherInfo | null;
  resolveFinisher: () => void;
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
  // The peer's own chosen fighter, reported over the "select" input message
  // (lib/online.ts) so the host never picks the joiner's character for
  // them — see CharacterSelect.tsx's online-aware step for how this gets
  // read. Only meaningful for the host; the joiner never reads it.
  onlinePeerCharacterId: string | null;
  setOnlinePeerCharacterId: (id: string | null) => void;
  // The joiner's CURRENTLY HELD movement direction (-1/0/1), reported
  // whenever it changes over the "move" input message (see
  // OnlineJoinerInput.tsx — edge-triggered, not a periodic nudge) and
  // applied continuously every host tick in tick() below, exactly the way
  // the player's own held-key movement gets applied every frame by
  // PlayerInput2D and local-multiplayer's P2 movement gets applied every
  // frame by LocalMultiplayerInput. Before this, the joiner's fighter only
  // moved in discrete ~50ms chunks applied instantly on message receipt,
  // which read as visibly steppy/jagged compared to every other fighter's
  // continuous per-frame motion — one movement mechanism for every side
  // now, online or not. Only meaningful for the host; the joiner's own
  // local copy of this field is never read (see applyState).
  joinerMoveDir: -1 | 0 | 1;
  setJoinerMoveDir: (dir: -1 | 0 | 1) => void;

  // --- story mode ---
  storyActive: boolean;
  storyIndex: number; // index into STORY_LADDER of the fight currently in progress
  storyPlayerId: string | null;

  // --- local same-keyboard 2P: opponent is human-controlled (see
  // components/game/LocalMultiplayerInput.tsx) instead of AI. Online
  // multiplayer is a separate mode (see lib/online.ts) that doesn't touch
  // this flag. ---
  localMultiplayer: boolean;

  // --- AI difficulty (see lib/difficulty.ts) — a persisted preference,
  // read once at store init and applied everywhere runAI makes a decision
  // plus the AI-damage scale in resolveDamage. One setting for both
  // versus-mode AI and every story-mode fight, changeable from Home. ---
  difficulty: DifficultyId;
  setDifficulty: (id: DifficultyId) => void;

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
  throwAttack: () => void; // named to avoid colliding with the `throw` keyword
  setBlocking: (on: boolean) => void;
  setCrouching: (on: boolean) => void;
  jump: () => void;
  special: () => void;
  move: (dir: -1 | 0 | 1, dtSec: number) => void;

  // --- player 2 input (local multiplayer only — controls the opponent
  // side directly instead of AI; see localMultiplayer above) ---
  punch2: () => void;
  kick2: () => void;
  throw2: () => void;
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
    attackStance: null,
    hitToken: 0,
    burnTicksLeft: 0,
    burnTickTimer: 0,
    burnDamage: 0,
    slowMsLeft: 0,
    slowFactor: 1,
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
  playerAirJumps: 0,
  opponentAirJumps: 0,
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
  comboCallout: null,
  finisher: null,
  resolveFinisher: () => {
    audio.stopAmbient();
    audio.playMusic("theme");
    set({ finisher: null, phase: "result" });
  },
  musicUnlocked: false,
  paused: false,
  tutorialSeen: readTutorialSeen(),
  showTutorial: false,

  onlineRole: null,
  onlineCode: null,
  // A fresh role assignment (new hosting/joining session) always starts
  // with no peer pick reported yet and no stale held direction, even if a
  // previous online session left one sitting around.
  setOnlineRole: (role, code = null) => set({ onlineRole: role, onlineCode: code, onlinePeerCharacterId: null, joinerMoveDir: 0 }),
  onlinePeerCharacterId: null,
  setOnlinePeerCharacterId: (id) => set({ onlinePeerCharacterId: id }),
  joinerMoveDir: 0,
  setJoinerMoveDir: (dir) => set({ joinerMoveDir: dir }),

  storyActive: false,
  storyIndex: 0,
  storyPlayerId: null,
  localMultiplayer: false,

  difficulty: readDifficulty(),
  setDifficulty: (id) => {
    saveDifficulty(id);
    set({ difficulty: id });
  },

  goHome: () =>
    set({
      phase: "home",
      storyActive: false,
      storyIndex: 0,
      storyPlayerId: null,
      localMultiplayer: false,
      onlineRole: null,
      onlineCode: null,
      onlinePeerCharacterId: null,
    }),
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
    resetAI();
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
      playerAirJumps: 0,
      opponentAirJumps: 0,
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
      comboCallout: null,
      finisher: null,
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
    resetAI();
    set({
      phase: "fight",
      roundNumber: s.roundNumber + 1,
      playerX: START_PLAYER_X,
      opponentX: START_OPPONENT_X,
      playerY: 0,
      playerVelY: 0,
      opponentY: 0,
      opponentVelY: 0,
      playerAirJumps: 0,
      opponentAirJumps: 0,
      matchTime: 99,
      winner: null,
      hitStop: 0,
      screenShake: 0,
      player: freshFighter(s.playerId),
      opponent: freshFighter(s.opponentId),
      hitEvents: [],
      projectiles: [],
      comboCallout: null,
      finisher: null,
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
  throwAttack: () => attemptThrow(set, get, "player"),

  setBlocking: (on) =>
    set((s) => {
      if (on) {
        if (s.player.action !== "idle" && s.player.action !== "walk" && s.player.action !== "crouch") return {};
        blockPressedAt.player = performance.now(); // edge-triggered (only real keydowns reach here) — see PARRY.windowMs
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

  // Grounded press = the real jump. A second press while still airborne is
  // a double jump — allowed exactly once per airborne stint (playerAirJumps
  // resets to 0 the instant tick() sees the fighter land) — with a snappier,
  // slightly shorter arc than the first jump so it reads as a distinct
  // "flip" rather than just replaying the same animation higher up.
  jump: () =>
    set((s) => {
      if (s.phase !== "fight" || s.paused) return {};
      if (!(s.player.action === "idle" || s.player.action === "walk" || s.player.action === "crouch")) return {};
      audio.unlock();
      if (s.playerY <= 0.02) return { playerVelY: JUMP.velocity, playerAirJumps: 0 };
      if (s.playerAirJumps >= 1) return {};
      return { playerVelY: JUMP.doubleJumpVelocity, playerAirJumps: s.playerAirJumps + 1 };
    }),

  special: () => fireSpecial(set, get, "player"),

  // Single horizontal axis, camera-free: dir is -1 (toward own left) or 1
  // (toward own right) on screen. Blocking/crouching hold you in place,
  // same as every other side-view fighter. Speed is this character's own
  // (element-passive-adjusted, see moveSpeedFor) base speed, further
  // scaled down while iced/slowed (see ELEMENT_EFFECTS.ice).
  move: (dir, dtSec) =>
    set((s) => {
      if (s.phase !== "fight" || s.paused || dir === 0) return {};
      if (!(s.player.action === "idle" || s.player.action === "walk")) return {};
      const slow = s.player.slowMsLeft > 0 ? s.player.slowFactor : 1;
      const speed = moveSpeedFor(s.playerId) * slow * dtSec;
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
  throw2: () => attemptThrow(set, get, "opponent"),

  setBlocking2: (on) =>
    set((s) => {
      if (on) {
        if (s.opponent.action !== "idle" && s.opponent.action !== "walk" && s.opponent.action !== "crouch") return {};
        blockPressedAt.opponent = performance.now();
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
      if (!(s.opponent.action === "idle" || s.opponent.action === "walk" || s.opponent.action === "crouch")) return {};
      audio.unlock();
      if (s.opponentY <= 0.02) return { opponentVelY: JUMP.velocity, opponentAirJumps: 0 };
      if (s.opponentAirJumps >= 1) return {};
      return { opponentVelY: JUMP.doubleJumpVelocity, opponentAirJumps: s.opponentAirJumps + 1 };
    }),

  special2: () => fireSpecial(set, get, "opponent"),

  move2: (dir, dtSec) =>
    set((s) => {
      if (s.phase !== "fight" || s.paused || dir === 0) return {};
      if (!(s.opponent.action === "idle" || s.opponent.action === "walk")) return {};
      const slow = s.opponent.slowMsLeft > 0 ? s.opponent.slowFactor : 1;
      const speed = moveSpeedFor(s.opponentId) * slow * dtSec;
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
    let playerAirJumps = s.playerAirJumps;
    if (playerY > 0 || playerVelY !== 0) {
      playerVelY -= JUMP.gravity * dt;
      playerY = Math.max(0, playerY + playerVelY * dt);
      if (playerY === 0) {
        playerVelY = 0;
        playerAirJumps = 0; // touched down — the double jump is available again next time they leave the ground
      }
    }
    let opponentY = s.opponentY;
    let opponentVelY = s.opponentVelY;
    let opponentAirJumps = s.opponentAirJumps;
    if (opponentY > 0 || opponentVelY !== 0) {
      opponentVelY -= JUMP.gravity * dt;
      opponentY = Math.max(0, opponentY + opponentVelY * dt);
      if (opponentY === 0) {
        opponentVelY = 0;
        opponentAirJumps = 0;
      }
    }

    // A player who stops pressing a movement key just reverts to idle next
    // tick since move() is only called while a key is actually held —
    // nothing here needs to detect "stopped moving" itself.
    let player = stepFighter(s.player, dtMs);
    let opponent = stepFighter(s.opponent, dtMs);
    if (player.action === "walk") player = { ...player, action: "idle" };
    if (opponent.action === "walk") opponent = { ...opponent, action: "idle" };

    // Elemental status: fire's burn ticks and ice's slow both decay purely
    // on the clock, independent of whatever action either fighter is
    // currently in (burning keeps ticking through a block; a slow keeps
    // counting down even mid-hitstun) — see ELEMENT_EFFECTS in lib/combat.ts.
    player = tickStatus(player, dtMs);
    opponent = tickStatus(opponent, dtMs);

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

    // The instant this tick is the one that actually decided the WHOLE
    // match (not just a round), hand off to a finisher cutscene instead of
    // jumping straight to the result screen — see FinisherInfo. `lastHit`
    // (set at the end of resolveAttack/applySpecialHit/resolveThrow) is
    // whatever landed the killing blow; a special gets the bigger beat.
    let finisher = s.finisher;
    if (winner && winner !== "draw" && !s.winner && matchOver && !finisher) {
      const winnerId = winner === "player" ? s.playerId : s.opponentId;
      finisher = {
        winnerSide: winner,
        kind: lastHit.kind ?? "normal",
        moveName: lastHit.kind === "special" && lastHit.moveName ? lastHit.moveName : getSpecial(winnerId).name,
      };
    }

    if (winner) {
      if (matchOver && finisher) {
        // Hold at phase "fight" — FightScreen renders FinisherSequence
        // while `finisher` is set, and its onDone calls resolveFinisher()
        // (the host's copy only, in online play) once the cutscene is
        // done, which is what actually performs this transition.
      } else {
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
    }

    set({
      matchTime,
      screenShake,
      playerY,
      playerVelY,
      playerAirJumps,
      opponentY,
      opponentVelY,
      opponentAirJumps,
      player,
      opponent,
      phase,
      winner,
      roundWins,
      matchOver,
      finisher,
    });

    stepProjectiles(set, get, dtMs);
    // A human at the keyboard controls the opponent side directly in local
    // multiplayer (see punch2/kick2/move2/etc. above) — AI would otherwise
    // fight the second player for control of the same fighter. An online
    // host is ALSO localMultiplayer:true for this same AI-off reason (see
    // FightScreen's input-selection comment) but has no local second
    // keyboard — its "P2" is the joiner, whose currently-held direction
    // (see joinerMoveDir/setJoinerMoveDir) gets applied right here, every
    // tick, with the host's own real per-frame dt — exactly the same
    // continuous-per-frame mechanism a local second keyboard's own move2()
    // calls already use, instead of the old approach of applying the
    // joiner's periodic network messages as isolated instant chunks (which
    // read as visibly steppy motion for the opponent, on both the host's
    // screen and the joiner's own mirrored view of it).
    if (!s.localMultiplayer) runAI(set, get, dtMs);
    else if (s.onlineRole === "host" && s.joinerMoveDir !== 0) get().move2(s.joinerMoveDir, dt);
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

const BURN_TICK_INTERVAL_MS = 500;

/** Advances fire's burn-over-time and ice's slow-timer, purely on the
 * clock — called every tick() for both fighters regardless of what action
 * either one is currently in (see FighterRuntime's own status-field
 * comments for why burning/slowed don't pause for a block or hitstun). */
function tickStatus(f: FighterRuntime, dtMs: number): FighterRuntime {
  let next = f;
  if (next.burnTicksLeft > 0) {
    const timer = next.burnTickTimer - dtMs;
    if (timer <= 0) {
      next = {
        ...next,
        health: clamp(next.health - next.burnDamage, 0, next.maxHealth),
        burnTicksLeft: next.burnTicksLeft - 1,
        burnTickTimer: BURN_TICK_INTERVAL_MS,
      };
    } else {
      next = { ...next, burnTickTimer: timer };
    }
  }
  if (next.slowMsLeft > 0) {
    next = { ...next, slowMsLeft: Math.max(0, next.slowMsLeft - dtMs) };
  }
  return next;
}

/** A fighter's current stance for attack-resolution purposes: airborne
 * always wins (a jump kick thrown a frame after leaving the ground is still
 * a jump kick), otherwise crouching if they were already holding crouch,
 * otherwise standing. */
function currentStance(actionY: number, action: ActionState): Stance {
  if (actionY > 0.02) return "air";
  if (action === "crouch") return "crouch";
  return "stand";
}

function attemptAttack(set: SetFn, get: GetFn, kind: AttackKind) {
  const s = get();
  if (s.phase !== "fight" || s.paused) return;
  if (s.player.action !== "idle" && s.player.action !== "walk" && s.player.action !== "crouch") return;
  const stance = currentStance(s.playerY, s.player.action);
  const move = getAttackMove(s.playerId, kind, stance);
  audio.unlock();

  // Resolve the hit THIS SAME TICK, using positions as they are right now —
  // no delayed re-check. The windup/recovery timing still runs for the
  // swing animation, but it's purely cosmetic and never gates whether the
  // hit landed (see the note at the top of lib/combat.ts).
  set({
    player: { ...s.player, action: kind, actionTimer: move.totalMs, actionTotal: move.totalMs, attackStance: stance },
  });
  resolveAttack(set, get, "player", kind, stance, move);
}

/** Local-multiplayer P2's punch/kick — same instant-resolve rule as P1's
 * attemptAttack, just targeting the opponent side (a real second player,
 * not AI, when this is ever called — see localMultiplayer). */
function attemptAttack2(set: SetFn, get: GetFn, kind: AttackKind) {
  const s = get();
  if (s.phase !== "fight" || s.paused) return;
  if (s.opponent.action !== "idle" && s.opponent.action !== "walk" && s.opponent.action !== "crouch") return;
  const stance = currentStance(s.opponentY, s.opponent.action);
  const move = getAttackMove(s.opponentId, kind, stance);
  audio.unlock();
  set({
    opponent: { ...s.opponent, action: kind, actionTimer: move.totalMs, actionTotal: move.totalMs, attackStance: stance },
  });
  resolveAttack(set, get, "opponent", kind, stance, move);
}

/** Throw — same instant-resolve-on-press discipline as a punch/kick, gated
 * the same way (idle/walk/crouch only), but goes through resolveThrow
 * instead of resolveAttack: no block check at all (a throw's whole point
 * is beating a turtling opponent), no combo-string buffer, bigger
 * knockback. Handles BOTH sides itself (unlike attemptAttack/
 * attemptAttack2's P1/P2 split) since there's no per-side special-casing
 * needed here beyond the existing `side` parameter every shared helper
 * already takes. */
function attemptThrow(set: SetFn, get: GetFn, side: "player" | "opponent") {
  const s = get();
  if (s.phase !== "fight" || s.paused) return;
  const fighter = side === "player" ? s.player : s.opponent;
  const characterId = side === "player" ? s.playerId : s.opponentId;
  if (fighter.action !== "idle" && fighter.action !== "walk" && fighter.action !== "crouch") return;
  const move = getThrowMove(characterId);
  audio.unlock();
  set({
    [side]: { ...fighter, action: "throw", actionTimer: move.totalMs, actionTotal: move.totalMs, attackStance: null },
  } as Partial<GameState>);
  resolveThrow(set, get, side, move);
}

function resolveThrow(set: SetFn, get: GetFn, side: "player" | "opponent", move: AttackProfile) {
  const s = get();
  const attackerId = side === "player" ? s.playerId : s.opponentId;
  const defenderId = side === "player" ? s.opponentId : s.playerId;
  const attacker = side === "player" ? s.player : s.opponent;
  const defender = side === "player" ? s.opponent : s.player;
  const defenderSide = side === "player" ? "opponent" : "player";

  const attackerX = side === "player" ? s.playerX : s.opponentX;
  const defenderX = side === "player" ? s.opponentX : s.playerX;
  if (Math.abs(defenderX - attackerX) > move.reach) return; // whiffed — opponent stepped out of true grab range

  let dmg = resolveDamage(move.damage, false, aiDamageScaleFor(s, side)); // throws ignore block entirely — never mitigated
  let meterGain = move.meterGain;

  const attackerComeback = attacker.health / attacker.maxHealth < COMEBACK.healthThreshold;
  if (attackerComeback) {
    dmg = Math.round(dmg * COMEBACK.damageMult);
    meterGain = Math.round(meterGain * COMEBACK.meterMult);
  }
  const atkFx = elementEffectFor(attackerId);
  void defenderId; // throws skip steel's chip-reduction entirely — there's no chip here, it's never mitigated
  if (atkFx.meterMult) meterGain = Math.round(meterGain * atkFx.meterMult);

  const newHealth = clamp(defender.health - dmg, 0, defender.maxHealth);
  const newAttackerMeter = meterAfterHit(attacker.meter, meterGain);

  // Throws reposition hard — a real toss, not a shove — before applying
  // any elemental bonus knockback on top.
  const knockback = BASE_KNOCKBACK * 2.5 + (atkFx.knockback ?? 0);
  const away = Math.sign(defenderX - attackerX) || (side === "player" ? 1 : -1);
  const pushedX = defenderX + away * knockback;
  const nextPlayerX = defenderSide === "player" ? resolveMoveX(pushedX, s.opponentX) : s.playerX;
  const nextOpponentX = defenderSide === "opponent" ? resolveMoveX(pushedX, s.playerX) : s.opponentX;

  audio.playSfx("hit_heavy");
  if (attacker.meter < 100 && newAttackerMeter >= 100) audio.playSfx("meter_full");

  const defenderPatch: Partial<FighterRuntime> = {
    health: newHealth,
    action: "hitstun",
    actionTimer: move.hitstun,
    actionTotal: move.hitstun,
    hitToken: defender.hitToken + 1,
    combo: 0,
  };

  lastHit.kind = "normal";
  lastHit.moveName = "Throw";

  if (side === "player") {
    set({
      opponent: { ...defender, ...defenderPatch },
      player: { ...attacker, meter: newAttackerMeter, combo: attacker.combo + 1 },
      playerX: nextPlayerX,
      opponentX: nextOpponentX,
      screenShake: 0.5,
      hitStop: 110,
    });
  } else {
    set({
      player: { ...defender, ...defenderPatch },
      opponent: { ...attacker, meter: newAttackerMeter, combo: attacker.combo + 1 },
      playerX: nextPlayerX,
      opponentX: nextOpponentX,
      screenShake: 0.5,
      hitStop: 110,
    });
  }
  pushHitEvent(set, get, "kick", side, dmg); // no dedicated HitEvent kind for throws — "kick"'s heavy-impact styling fits close enough
}

// Rolling per-side buffers of recently-CONNECTED (not whiffed) attacks, used
// only to detect the named combo strings in COMBOS — see matchCombo below.
// Module-level rather than store state on purpose: nothing outside combat
// resolution ever needs to read these, and they don't need to survive a
// network round-trip (the host is the only side that ever calls
// resolveAttack — see lib/online.ts's top comment — so a joiner never needs
// its own copy).
let comboBufferPlayer: { kind: AttackKind; t: number }[] = [];
let comboBufferOpponent: { kind: AttackKind; t: number }[] = [];
let nextComboToken = 1;
const MAX_COMBO_LEN = Math.max(...COMBOS.map((c) => c.sequence.length));

// performance.now() timestamp of the most recent real keydown that started
// blocking, per side — see PARRY.windowMs in resolveAttack. Module-level
// (not store state) since it's pure input timing nothing else needs to
// read or sync over the network.
const blockPressedAt = { player: 0, opponent: 0 };

// Whatever most recently landed a real hit, for tick()'s finisher trigger
// to read the instant it detects the match-deciding blow — set at the end
// of resolveAttack/resolveThrow ("normal") and inside fireSpecial's
// setTimeout callback ("special") right before applySpecialHit runs.
// Deliberately NOT cleared after every hit — only the finisher trigger
// itself ever reads it, and only in the one tick a match actually ends, so
// stale leftovers from earlier in the same match are harmless (they just
// get overwritten by the next real hit long before anyone reads them).
const lastHit: { kind: "special" | "normal" | null; moveName: string | null } = { kind: null, moveName: null };

/** Does this side's connected-hit buffer end with a known combo string
 * (checked longest-first, so a 4-hit string isn't pre-empted by a 3-hit
 * one sharing its tail), all thrown within COMBO_WINDOW_MS of each other?
 * Consumes (clears) the buffer on a match so the same string has to be
 * rebuilt to trigger again, rather than re-triggering on every subsequent
 * hit via the sliding window. */
function matchCombo(buf: { kind: AttackKind; t: number }[]): ComboDef | null {
  for (const combo of [...COMBOS].sort((a, b) => b.sequence.length - a.sequence.length)) {
    const n = combo.sequence.length;
    if (buf.length < n) continue;
    const tail = buf.slice(-n);
    let inWindow = true;
    for (let i = 1; i < n; i++) {
      if (tail[i].t - tail[i - 1].t > COMBO_WINDOW_MS) {
        inWindow = false;
        break;
      }
    }
    if (inWindow && combo.sequence.every((k, i) => k === tail[i].kind)) return combo;
  }
  return null;
}

/** The AI-damage difficulty scale (see lib/difficulty.ts) only ever applies
 * to a genuinely AI-controlled attack — the "opponent" side is a real human
 * (local-multiplayer P2, or an online joiner) in those modes, and a human's
 * own damage output is never scaled down regardless of which side of the
 * store they happen to occupy. */
function aiDamageScaleFor(s: GameState, side: "player" | "opponent"): number | null {
  if (side !== "opponent" || s.localMultiplayer || s.onlineRole) return null;
  return DIFFICULTIES[s.difficulty].damageScale;
}

function resolveAttack(set: SetFn, get: GetFn, side: "player" | "opponent", kind: AttackKind, stance: Stance, move: AttackProfile) {
  const s = get();
  const attackerId = side === "player" ? s.playerId : s.opponentId;
  const defenderId = side === "player" ? s.opponentId : s.playerId;
  const attacker = side === "player" ? s.player : s.opponent;
  const defender = side === "player" ? s.opponent : s.player;
  const defenderSide = side === "player" ? "opponent" : "player";
  const defenderMove = defender.action;

  const attackerX = side === "player" ? s.playerX : s.opponentX;
  const defenderX = side === "player" ? s.opponentX : s.playerX;
  if (Math.abs(defenderX - attackerX) > move.reach) return;

  const blocking = defenderMove === "block";

  // --- Parry: the defender pressed block within PARRY.windowMs of THIS
  // hit actually landing — zero damage, the attacker's own recovery gets
  // extended as a hard punish, and the defender banks bonus meter. Checked
  // before the attack touches the combo buffer at all — a parried swing
  // never builds toward (or breaks) either side's combo string. ---
  if (blocking) {
    const pressedAt = defenderSide === "player" ? blockPressedAt.player : blockPressedAt.opponent;
    if (performance.now() - pressedAt <= PARRY.windowMs) {
      const punishedAttacker: FighterRuntime = {
        ...attacker,
        actionTimer: attacker.actionTimer + PARRY.attackerPunishMs,
        actionTotal: attacker.actionTotal + PARRY.attackerPunishMs,
      };
      const rewardedDefender: FighterRuntime = { ...defender, meter: meterAfterHit(defender.meter, PARRY.meterBonus) };
      set({
        [side]: punishedAttacker,
        [defenderSide]: rewardedDefender,
        screenShake: 0.5,
        hitStop: 140,
        comboCallout: { label: "PARRY!", side: defenderSide, token: nextComboToken++ },
      } as Partial<GameState>);
      audio.playSfx("block");
      pushHitEvent(set, get, "block", side);
      return;
    }
  }

  let dmg = resolveDamage(move.damage, blocking, aiDamageScaleFor(s, side));
  let meterGain = move.meterGain;

  // Damage scaling: hits already mid-combo (attacker.combo counts
  // consecutive landed hits since the attacker last got tagged) hit
  // progressively softer, so a long string of plain pokes isn't a free
  // infinite — see COMBO_SCALING. The combo-finisher multiplier below
  // still applies on TOP of this, so landing the actual named string
  // stays strictly better than mashing.
  dmg = Math.round(dmg * Math.max(COMBO_SCALING.floor, 1 - attacker.combo * COMBO_SCALING.perHit));

  // Comeback: attacking FROM low health hits harder and builds meter
  // faster (see COMEBACK in lib/combat.ts) — the lore's own "stop
  // performing and just are the thing you always claimed to be," as an
  // actual mechanic.
  const attackerComeback = attacker.health / attacker.maxHealth < COMEBACK.healthThreshold;
  if (attackerComeback) {
    dmg = Math.round(dmg * COMEBACK.damageMult);
    meterGain = Math.round(meterGain * COMEBACK.meterMult);
  }

  // Elemental effects — attacker's element flavors the hit itself
  // (meter/hit-stop), defender's element can blunt it back (steel's chip
  // reduction only matters while blocking). See ELEMENT_EFFECTS.
  const atkFx = elementEffectFor(attackerId);
  const defFx = elementEffectFor(defenderId);
  if (atkFx.meterMult) meterGain = Math.round(meterGain * atkFx.meterMult);
  if (blocking && defFx.chipReduction) dmg = Math.round(dmg * defFx.chipReduction);

  // A whiffed swing (handled above via the early return) never reaches the
  // buffer at all, so only real connects build toward a combo — mashing at
  // the air doesn't help you land one. A stale gap (see COMBO_WINDOW_MS)
  // also just falls out of matchCombo's window check on its own next call.
  const buf = side === "player" ? comboBufferPlayer : comboBufferOpponent;
  buf.push({ kind, t: performance.now() });
  if (buf.length > MAX_COMBO_LEN) buf.shift();
  const combo = matchCombo(buf);
  if (combo) {
    dmg = Math.round(dmg * combo.damageMult);
    meterGain = Math.round(meterGain * combo.meterMult);
    buf.length = 0; // consumed — has to be rebuilt from scratch to fire again
    set({ comboCallout: { label: combo.label, side, token: nextComboToken++ } });
  }

  const newHealth = clamp(defender.health - dmg, 0, defender.maxHealth);
  const newAttackerMeter = meterAfterHit(attacker.meter, meterGain);
  let hitstun = move.hitstun;
  if (!blocking) {
    hitstun += atkFx.hitstunBonus ?? 0;
    if (atkFx.stunChance && Math.random() < atkFx.stunChance) hitstun += atkFx.stunChanceBonus ?? 0;
  }
  // A jump kick lands with real impact — a bigger hit-stop/screen-shake
  // flourish than a grounded attack, on top of already dealing the most
  // damage/hitstun of any normal. A combo finisher gets the same
  // bump-up treatment regardless of kind, since it's meant to read as the
  // biggest moment in the exchange. Earth hits ALSO get a flourish bump
  // (ELEMENT_EFFECTS.earth.hitStopMult) — the ground remembers, etc.
  const impact = (kind === "kick" ? (stance === "air" ? 1.4 : 1) : 0.5) * (combo ? 1.5 : 1) * (blocking ? 1 : (atkFx.hitStopMult ?? 1));

  audio.playSfx(blocking ? "block" : combo ? "special_release" : kind === "kick" ? "hit_heavy" : "hit_light");
  if (attacker.meter < 100 && newAttackerMeter >= 100) audio.playSfx("meter_full");

  // Knockback — a small universal push on every non-blocked hit, bigger
  // for wind/kinetic/void (see ELEMENT_EFFECTS) — shoves the DEFENDER
  // further from the attacker, clamped to the stage/minimum-separation
  // rules same as any other movement.
  let nextPlayerX = s.playerX;
  let nextOpponentX = s.opponentX;
  if (!blocking) {
    const knockback = BASE_KNOCKBACK + (atkFx.knockback ?? 0);
    const away = Math.sign(defenderX - attackerX) || (side === "player" ? 1 : -1);
    const pushedX = defenderX + away * knockback;
    if (defenderSide === "player") nextPlayerX = resolveMoveX(pushedX, s.opponentX);
    else nextOpponentX = resolveMoveX(pushedX, s.playerX);
  }

  const burnFx = !blocking ? atkFx : undefined;
  const defenderPatch: Partial<FighterRuntime> = blocking
    ? { health: newHealth }
    : {
        health: newHealth,
        action: "hitstun",
        actionTimer: hitstun,
        actionTotal: hitstun,
        hitToken: defender.hitToken + 1,
        combo: 0,
        ...(burnFx?.burnTicks
          ? { burnTicksLeft: burnFx.burnTicks, burnTickTimer: BURN_TICK_INTERVAL_MS, burnDamage: burnFx.burnDamage ?? 0 }
          : {}),
        ...(burnFx?.slowMs ? { slowMsLeft: burnFx.slowMs, slowFactor: burnFx.slowFactor ?? 1 } : {}),
      };

  lastHit.kind = "normal";
  lastHit.moveName = combo ? combo.label.replace(/!$/, "") : kind === "kick" ? "Kick" : "Punch";

  if (side === "player") {
    set({
      opponent: { ...defender, ...defenderPatch },
      player: { ...attacker, meter: newAttackerMeter, combo: attacker.combo + 1 },
      playerX: nextPlayerX,
      opponentX: nextOpponentX,
      screenShake: 0.4 * impact,
      hitStop: blocking ? 0 : Math.round(90 * impact),
    });
  } else {
    set({
      player: { ...defender, ...defenderPatch },
      opponent: { ...attacker, meter: newAttackerMeter, combo: attacker.combo + 1 },
      playerX: nextPlayerX,
      opponentX: nextOpponentX,
      screenShake: 0.4 * impact,
      hitStop: blocking ? 0 : Math.round(90 * impact),
    });
  }
  pushHitEvent(set, get, blocking ? "block" : kind, side, dmg);
}

function pushHitEvent(set: SetFn, get: GetFn, kind: HitEvent["kind"], side: HitEvent["side"], damage = 0) {
  const s = get();
  const events = [...s.hitEvents, { id: nextHitId(), kind, side, t: performance.now(), damage }].slice(-12);
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
        applySpecialHit(set, get, side, move.damage, move.name);
      }
    }

    const after = get();
    const attackerNow = side === "player" ? after.player : after.opponent;
    set({
      [side]: { ...attackerNow, action: "cooldown", actionTimer: TIMING.cooldown, actionTotal: TIMING.cooldown, meter: 0 },
    });
  }, TIMING.specialWindup);
}

function applySpecialHit(set: SetFn, get: GetFn, side: "player" | "opponent", damage: number, moveName: string) {
  const s = get();
  const attacker = side === "player" ? s.player : s.opponent;
  const defender = side === "player" ? s.opponent : s.player;
  const blocking = defender.action === "block";
  let dmg = resolveDamage(damage, blocking, aiDamageScaleFor(s, side));
  if (attacker.health / attacker.maxHealth < COMEBACK.healthThreshold) dmg = Math.round(dmg * COMEBACK.damageMult);
  const newHealth = clamp(defender.health - dmg, 0, defender.maxHealth);
  const patch: Partial<FighterRuntime> = blocking
    ? { health: newHealth }
    : { health: newHealth, action: "hitstun", actionTimer: TIMING.specialHitstun, actionTotal: TIMING.specialHitstun, hitToken: defender.hitToken + 1, combo: 0 };
  lastHit.kind = "special";
  lastHit.moveName = moveName;
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
  let hitCharacterId = "";

  for (const p of s.projectiles) {
    const x = p.x + p.dir * PROJECTILE.speed * dt;
    const targetX = p.side === "player" ? get().opponentX : get().playerX;
    if (Math.abs(x - targetX) <= PROJECTILE.hitRadius) {
      hitSide = p.side;
      hitDamage = p.damage;
      hitCharacterId = p.characterId;
      continue; // consumed on hit
    }
    if (x < -bound - 1 || x > bound + 1) continue; // flew off stage — miss
    remaining.push({ ...p, x });
  }

  if (hitSide) applySpecialHit(set, get, hitSide, hitDamage, getSpecial(hitCharacterId).name);
  set({ projectiles: remaining });
}

// --- Opponent AI: independent movement + punch/kick/block/jump/special
// decisions along the single stage axis, plus a reactive layer (guard +
// punish) that runs every tick instead of being throttled behind the
// decision timer below — see runAI's top comment for why that throttling
// used to be the whole problem. ---
let aiNextDecision = 0;
let aiClock = 0;
// Alternates between brawling in close and hanging back, rather than
// always beelining to melee distance.
let aiPreferredRange = 1.2;
let aiRangeUntil = 0;
// The AI's current horizontal movement intent (-1/0/1), re-rolled only
// periodically (see aiMoveUntil) and held FIXED in between — deliberately
// NOT recomputed every tick from the player's live position. The old
// version recalculated "toward or away from the player" fresh every
// single frame, so any step the player took could flip the AI's direction
// that same frame — reading as a tight, reflexive mirror of the player's
// own movement ("it backs off the instant I step closer") rather than an
// opponent with its own plan. Picking a direction once and committing to
// it for a beat is what makes the spacing read as a decision instead.
let aiMoveDir: -1 | 0 | 1 = 0;
let aiMoveUntil = 0;
// Edge-detects a fresh player punch/kick every tick (see playerJustSwung
// below) — independent of aiNextDecision's 180-700ms cadence, which used to
// mean the old AI usually only "noticed" an attack a full decision cycle
// after it had already landed.
let aiLastPlayerAction: ActionState = "idle";
// aiClock timestamp; while aiClock is under this, the AI is "hungry" to
// throw a counter-attack the instant it's next free — set on every fresh
// player swing (see playerJustSwung), consumed the moment it fires one.
let aiPunishUntil = 0;
// ms spent pinned against the stage wall on the side the player is
// pressing from, wanting to retreat but physically unable to — see
// pinnedAtWall below. Driving "aggressive mode" off a streak (not just the
// instantaneous position) means briefly clipping the wall in transit
// doesn't flip the AI's whole behavior for one frame.
let aiCornerStreak = 0;
// Queued follow-up hits for a deliberate combo string (see COMBOS in
// lib/combat.ts) — the same named sequences the player can land, so the AI
// throwing one back is a real threat, not flavor text.
let aiComboPlan: AttackKind[] = [];

/** Clears every module-level AI/combo-buffer scratch variable — called at
 * the start of every match and every new round (see startMatch/nextRound)
 * so a fresh round never inherits e.g. a stale punish window or a
 * half-built combo buffer from the fight that just ended. */
function resetAI() {
  aiClock = 0;
  aiNextDecision = 0;
  aiRangeUntil = 0;
  aiMoveDir = 0;
  aiMoveUntil = 0;
  aiLastPlayerAction = "idle";
  aiPunishUntil = 0;
  aiCornerStreak = 0;
  aiComboPlan = [];
  comboBufferPlayer = [];
  comboBufferOpponent = [];
  blockPressedAt.player = 0;
  blockPressedAt.opponent = 0;
  lastHit.kind = null;
  lastHit.moveName = null;
}

function throwAIAttack(set: SetFn, get: GetFn, cur: GameState, forcedKind?: AttackKind) {
  const kind: AttackKind = forcedKind ?? (Math.random() < 0.55 ? "punch" : "kick");
  const stance = currentStance(cur.opponentY, cur.opponent.action);
  const move = getAttackMove(cur.opponentId, kind, stance);
  set({
    opponent: { ...cur.opponent, action: kind, actionTimer: move.totalMs, actionTotal: move.totalMs, attackStance: stance },
  });
  resolveAttack(set, get, "opponent", kind, stance, move);
}

function rollRange([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

function runAI(set: SetFn, get: GetFn, dtMs: number) {
  aiClock += dtMs;
  const s = get();
  if (s.opponent.action === "ko" || s.player.action === "ko") return;
  const diff = DIFFICULTIES[s.difficulty];

  const playerJustSwung = (s.player.action === "punch" || s.player.action === "kick") && aiLastPlayerAction !== s.player.action;
  aiLastPlayerAction = s.player.action;

  const bound = STAGE.width / 2 - STAGE.margin;
  const dNow = Math.abs(s.opponentX - s.playerX);
  // Pinned against the wall on the side the player is standing on — i.e.
  // actually trapped, not just passing through the edge on the way
  // somewhere else.
  const pinnedAtWall = bound - Math.abs(s.opponentX) < 1.3 && Math.sign(s.opponentX || 1) === -Math.sign(s.playerX - s.opponentX || 1);
  aiCornerStreak = pinnedAtWall && dNow < aiPreferredRange + 1.5 ? aiCornerStreak + dtMs : 0;
  // Pinned for a real stretch, not one frame: stop wasting the spacing
  // logic on a retreat that isn't going to happen, and fight instead — the
  // direct fix for "corner it and it just stands there."
  const aggressive = aiCornerStreak > 450;

  // --- Movement: cornered-and-pressing always overrides the periodic
  // intent below (there's nothing to "decide" while pinned — just close
  // the gap), otherwise a movement intent is re-rolled only periodically
  // and held fixed until the next roll — see aiMoveDir's declaration for
  // why this is the actual fix for the mirroring complaint. ---
  const aiSlow = s.opponent.slowMsLeft > 0 ? s.opponent.slowFactor : 1;
  if (aggressive) {
    if (dNow > RANGE.reach && (s.opponent.action === "idle" || s.opponent.action === "walk")) {
      const toward = Math.sign(s.playerX - s.opponentX) || 1;
      const speed = moveSpeedFor(s.opponentId) * 1.2 * aiSlow * (dtMs / 1000);
      const nextX = resolveMoveX(s.opponentX + toward * speed, s.playerX);
      set({ opponentX: nextX, opponent: { ...get().opponent, action: "walk" } });
    }
  } else {
    if (aiClock > aiMoveUntil) {
      aiMoveUntil = aiClock + 700 + Math.random() * 1400;
      const d = s.playerX - s.opponentX;
      const dist = Math.abs(d);
      const toward = (Math.sign(d) || 1) as -1 | 1;
      if (dist > 6.5) {
        aiMoveDir = toward; // too far apart to do anything productive besides closing in eventually
      } else if (Math.random() < diff.holdGroundChance) {
        aiMoveDir = 0; // deliberately just holds this stretch — not every beat is a reaction to you
      } else {
        // Alternates between brawling in close and hanging back, rather
        // than always beelining to melee distance — re-rolled on its own
        // slower clock, independent of this movement-intent window.
        if (aiClock > aiRangeUntil) {
          aiRangeUntil = aiClock + 2500 + Math.random() * 3500;
          aiPreferredRange = Math.random() < 0.55 ? 1.1 : 3 + Math.random() * 4;
        }
        aiMoveDir = dist > aiPreferredRange + 0.4 ? toward : dist < aiPreferredRange - 0.4 ? ((-toward) as -1 | 1) : 0;
      }
    }
    if (aiMoveDir !== 0 && (s.opponent.action === "idle" || s.opponent.action === "walk")) {
      const speed = moveSpeedFor(s.opponentId) * aiSlow * (dtMs / 1000);
      const nextX = resolveMoveX(s.opponentX + aiMoveDir * speed, s.playerX);
      set({ opponentX: nextX, opponent: { ...get().opponent, action: "walk" } });
    }
  }

  // --- Reactive guard: rolls to block the INSTANT the player's swing
  // starts (every tick, not gated behind aiNextDecision) and, whether or
  // not it guards, marks a punish window so it swings back the moment it's
  // next free. Cornered AI guards noticeably more (it can't retreat, so
  // blocking is the only defense left) instead of just eating hits. ---
  if (playerJustSwung) {
    const guardState = get();
    if ((guardState.opponent.action === "idle" || guardState.opponent.action === "walk") && dNow <= RANGE.reach + 0.6) {
      const blockChance = aggressive ? diff.blockChanceAggressive : diff.blockChance;
      if (Math.random() < blockChance) {
        set({ opponent: { ...guardState.opponent, action: "block" } });
        window.setTimeout(() => {
          const c = get();
          if (c.phase === "fight" && c.opponent.action === "block") set({ opponent: { ...c.opponent, action: "idle" } });
        }, 260 + Math.random() * 180);
      }
    }
    if (Math.random() < diff.punishChance) aiPunishUntil = aiClock + 900;
  }

  // --- Punish priority: bypasses aiNextDecision entirely, so the counter
  // fires the instant the AI is free instead of on the next random decision
  // tick — the direct fix for "corner it and just attack": every attack you
  // throw now draws an immediate reply once your own recovery ends. ---
  const punishState = get();
  if (aiClock < aiPunishUntil && punishState.opponent.action === "idle") {
    if (Math.abs(punishState.opponentX - punishState.playerX) <= RANGE.reach) {
      aiPunishUntil = 0;
      throwAIAttack(set, get, punishState);
      return;
    }
  }

  // --- Deliberate combo strings: follow-up hits queued by the decision
  // branch below fire back-to-back here with no extra delay, same rhythm a
  // human chaining the same COMBOS pattern would use. ---
  if (aiComboPlan.length > 0) {
    const comboState = get();
    if (comboState.opponent.action === "idle") {
      if (Math.abs(comboState.opponentX - comboState.playerX) <= RANGE.reach) {
        throwAIAttack(set, get, comboState, aiComboPlan.shift());
        return;
      }
      aiComboPlan = []; // opponent got out of range — string broken, don't force it
    }
  }

  if (aiClock < aiNextDecision) return;
  aiNextDecision = aiClock + rollRange(aggressive ? diff.decisionMsAggressive : diff.decisionMs);

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

  if (!inMelee && !aggressive && roll < 0.12 && cur.opponentY <= 0.02) {
    set({ opponentVelY: JUMP.velocity });
    return;
  }

  // A turtling player (holding block right now, in melee range) is exactly
  // what a throw is FOR — beats block outright. Scaled off the same
  // per-tier attackChance rather than a whole new difficulty knob: a more
  // aggressive tier is also a smarter one about capitalizing on this read.
  if (inMelee && cur.player.action === "block" && Math.random() < diff.attackChance * 0.5) {
    attemptThrow(set, get, "opponent");
    return;
  }

  const attackChance = Math.min(0.98, diff.attackChance + (aggressive ? 0.1 : 0));
  if (inMelee && roll < attackChance) {
    // Occasionally commits to a full named combo string instead of a
    // single hit — more often, and more readily, while pressing an
    // advantage (aggressive mode).
    if (Math.random() < (aggressive ? diff.comboChanceAggressive : diff.comboChance)) {
      const plan = COMBOS[Math.floor(Math.random() * COMBOS.length)];
      aiComboPlan = plan.sequence.slice(1);
      throwAIAttack(set, get, cur, plan.sequence[0]);
    } else {
      throwAIAttack(set, get, cur);
    }
  }
}

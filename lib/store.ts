"use client";

import { create } from "zustand";
import {
  getCharacter,
  getPunchMove,
  getSpecial,
  resolveDamage,
  meterAfterHit,
  dist,
  TIMING,
  RANGE,
  ARENA,
  JUMP,
  GUN,
  AMMO,
  BUILD_POWER,
  type Vec2,
} from "./combat";
import { audio } from "./audio";
import { ARENAS } from "./arenas";
import { STORY_LADDER } from "./story";
import type { LootItem } from "./types";

export type MatchPhase = "home" | "select" | "story_select" | "fight" | "result";
export type ActionState =
  | "idle"
  | "attack_light"
  | "attack_heavy"
  | "shoot"
  | "reload"
  | "block"
  | "dodge"
  | "hitstun"
  | "charge"
  | "special"
  | "cooldown"
  | "ko";
export type CameraState =
  | "FIRST_PERSON"
  | "CINEMATIC_TRANSITION"
  | "SCRIPTED_SHOT"
  | "RETURN_TRANSITION";

export interface FighterRuntime {
  characterId: string;
  health: number;
  maxHealth: number;
  meter: number;
  combo: number;
  action: ActionState;
  actionTimer: number; // ms remaining in current action phase
  actionTotal: number; // ms total duration of current action (for progress bars)
  facingLean: number; // -1..1, cosmetic strafe lean (camera roll + dodge memory)
  chargeHeld: number; // ms held so far, while action === 'charge'
  interruptible: boolean;
  gunCooldown: number; // ms remaining before the next shot can fire
  ammo: number; // rounds left in the current magazine
  /** Increments on every landed, non-blocked hit this fighter takes — Fighter
   * (the 3D body) watches this to trigger a knockback impulse. */
  hitToken: number;
}

export interface HitEvent {
  id: number;
  kind: "light" | "heavy" | "shoot" | "special" | "block";
  side: "player" | "opponent";
  t: number;
}

/** One resolved gunshot — pushed whether it lands or not so GunTracer can
 * draw a tracer beam either way (a miss should still visibly go somewhere). */
export interface GunShot {
  id: number;
  side: "player" | "opponent";
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  hit: boolean;
  t: number;
}

interface GameState {
  phase: MatchPhase;
  playerId: string;
  opponentId: string;
  arenaId: string;
  playerPos: Vec2;
  opponentPos: Vec2;
  playerY: number; // jump height above ground, 0 = grounded
  playerVelY: number;
  matchTime: number; // seconds remaining
  winner: "player" | "opponent" | "draw" | null;
  cameraState: CameraState;
  cameraOwner: "player" | "opponent" | null;
  hitStop: number; // ms of slo-mo/freeze remaining
  screenShake: number; // 0..1 decaying
  stadiumFlash: number; // 0..1 decaying, arena reacts by boosting light/particles
  player: FighterRuntime;
  opponent: FighterRuntime;
  hitEvents: HitEvent[];
  gunShots: GunShot[];
  lootItems: LootItem[];
  /** True the instant the player's reticle is over the opponent closely
   * enough that firing would land (same cone GUN.aimConeRad gates the
   * actual hit on — see AimAssist.tsx) — driven every render frame from
   * camera-space data outside the fixed-tick loop, so it's plain state
   * here, not something tick() computes. */
  aimAssist: boolean;
  musicUnlocked: boolean;
  paused: boolean;
  tutorialSeen: boolean;
  showTutorial: boolean;

  // --- story mode ---
  storyActive: boolean;
  storyIndex: number; // index into STORY_LADDER of the fight currently in progress
  storyPlayerId: string | null;

  // --- lifecycle ---
  goHome: () => void;
  goSelect: () => void;
  goStorySelect: () => void;
  startMatch: (playerId: string, opponentId: string, arenaId?: string) => void;
  startStoryRun: (playerId: string) => void;
  advanceStory: () => void; // called after a story-mode win — next fight, or run complete
  endStoryRun: () => void;
  restartMatch: () => void;
  setPaused: (p: boolean) => void;
  dismissTutorial: () => void;
  openTutorial: () => void;

  // --- player input ---
  shootGun: (yaw: number) => void; // LMB — hitscan, instant, long range + tight aim cone
  reload: () => void; // R — refills the magazine after AMMO.reloadMs
  lightAttack: (yaw: number) => void; // unarmed punch — instant, reach+facing checked
  heavyAttack: (yaw: number) => void; // unarmed heavy punch, RMB — instant, reach+facing checked
  setBlocking: (on: boolean) => void;
  dodge: (dir: -1 | 1, yaw: number) => void;
  jump: () => void;
  chargeStart: () => void;
  chargeRelease: () => void;
  moveAxis: (fwd: number, strafe: number, dtSec: number, yaw: number) => void;

  // --- sim ---
  tick: (dtMs: number) => void;
}

const FIGHTER_TICK_ID = { current: 1 };
function nextHitId() {
  return FIGHTER_TICK_ID.current++;
}
const GUN_SHOT_ID = { current: 1 };
function nextGunShotId() {
  return GUN_SHOT_ID.current++;
}
const LOOT_TICK_ID = { current: 1 };
function nextLootId() {
  return LOOT_TICK_ID.current++;
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
    facingLean: 0,
    chargeHeld: 0,
    interruptible: true,
    gunCooldown: 0,
    ammo: AMMO.magSize,
    hitToken: 0,
  };
}

const START_PLAYER_POS: Vec2 = { x: 0, z: 3.5 };
const START_OPPONENT_POS: Vec2 = { x: 0, z: -3.5 };
const LOOT_PICKUP_RADIUS = 1.1;

function readTutorialSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem("mogoff_tutorial_seen") === "1";
  } catch {
    return false;
  }
}

// Shared helper signatures matching what Zustand's `create` callback hands
// us, so the free functions below (attemptAttack/resolveSwing/fireSpecial/
// runAI) don't need to be inlined into the store just to get proper types.
type SetFn = (
  partial: Partial<GameState> | ((s: GameState) => Partial<GameState> | GameState),
  replace?: false
) => void;
type GetFn = () => GameState;

function attackTiming(kind: "light" | "heavy", characterId?: string) {
  const t = TIMING[kind];
  const speed = characterId ? BUILD_POWER[getCharacter(characterId).build].speed : 1;
  const scale = (ms: number) => Math.round(ms / speed);
  return {
    windup: scale(t.windup),
    active: scale(t.active),
    recovery: scale(t.recovery),
    total: scale(t.windup + t.active + t.recovery),
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Keep a fighter inside the arena floor and never fully overlapping the
 * other fighter, without changing the direction they were trying to move in. */
function resolveMove(next: Vec2, other: Vec2): Vec2 {
  const bound = ARENA.radius - ARENA.moveMargin;
  const r = Math.hypot(next.x, next.z);
  let out = next;
  if (r > bound) {
    const k = bound / r;
    out = { x: next.x * k, z: next.z * k };
  }
  const d = dist(out, other);
  if (d < ARENA.minSeparation) {
    const dx = out.x - other.x || 0.001;
    const dz = out.z - other.z || 0;
    const k2 = ARENA.minSeparation / (Math.hypot(dx, dz) || 1);
    out = { x: other.x + dx * k2, z: other.z + dz * k2 };
  }
  return out;
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: "home",
  playerId: "gautham",
  opponentId: "garv",
  arenaId: ARENAS.fire.id,
  playerPos: { ...START_PLAYER_POS },
  opponentPos: { ...START_OPPONENT_POS },
  playerY: 0,
  playerVelY: 0,
  matchTime: 150,
  winner: null,
  cameraState: "FIRST_PERSON",
  cameraOwner: null,
  hitStop: 0,
  screenShake: 0,
  stadiumFlash: 0,
  player: freshFighter("gautham"),
  opponent: freshFighter("garv"),
  hitEvents: [],
  gunShots: [],
  lootItems: [],
  aimAssist: false,
  musicUnlocked: false,
  paused: false,
  tutorialSeen: readTutorialSeen(),
  showTutorial: false,

  storyActive: false,
  storyIndex: 0,
  storyPlayerId: null,

  goHome: () => set({ phase: "home", storyActive: false, storyIndex: 0, storyPlayerId: null }),
  goSelect: () => set({ phase: "select", storyActive: false, storyIndex: 0, storyPlayerId: null }),
  goStorySelect: () => set({ phase: "story_select" }),

  startStoryRun: (playerId) => {
    set({ storyActive: true, storyIndex: 0, storyPlayerId: playerId });
    const firstOpponent = STORY_LADDER[0];
    get().startMatch(playerId, firstOpponent, getCharacter(firstOpponent).arenaId);
  },

  advanceStory: () => {
    const s = get();
    if (!s.storyActive || !s.storyPlayerId) return;
    const nextIndex = s.storyIndex + 1;
    const nextOpponent = STORY_LADDER[nextIndex];
    if (!nextOpponent) {
      // Ladder complete — stay on the result screen; ResultScreen shows the
      // ending. Nothing left to start.
      set({ storyIndex: nextIndex });
      return;
    }
    set({ storyIndex: nextIndex });
    get().startMatch(s.storyPlayerId, nextOpponent, getCharacter(nextOpponent).arenaId);
  },

  endStoryRun: () => set({ storyActive: false, storyIndex: 0, storyPlayerId: null }),

  startMatch: (playerId, opponentId, arenaId) => {
    const resolvedArena = arenaId ?? getCharacter(playerId).arenaId;
    audio.setThemeVolume(0.14);
    audio.playAmbient(ARENAS[resolvedArena]?.ambientTrack ?? resolvedArena);
    const tutorialSeen = get().tutorialSeen;
    lootNextSpawn = 8000 + Math.random() * 4000;
    lootClock = 0;
    set({
      phase: "fight",
      playerId,
      opponentId,
      arenaId: resolvedArena,
      playerPos: { ...START_PLAYER_POS },
      opponentPos: { ...START_OPPONENT_POS },
      playerY: 0,
      playerVelY: 0,
      matchTime: 150,
      winner: null,
      cameraState: "FIRST_PERSON",
      cameraOwner: null,
      hitStop: 0,
      screenShake: 0,
      stadiumFlash: 0,
      player: freshFighter(playerId),
      opponent: freshFighter(opponentId),
      hitEvents: [],
      gunShots: [],
      lootItems: [],
      aimAssist: false,
      paused: !tutorialSeen,
      showTutorial: !tutorialSeen,
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

  shootGun: (yaw) => attemptShot(set, get, yaw),
  reload: () =>
    set((s) => {
      if (s.phase !== "fight" || s.paused) return {};
      if (s.player.action !== "idle") return {};
      if (s.player.ammo >= AMMO.magSize) return {};
      audio.playSfx("dodge"); // quick mechanical whoosh — closest existing SFX to a reload without generating a new asset
      return {
        player: { ...s.player, action: "reload", actionTimer: AMMO.reloadMs, actionTotal: AMMO.reloadMs },
      };
    }),
  lightAttack: (yaw) => attemptAttack(set, get, "light", yaw),
  heavyAttack: (yaw) => attemptAttack(set, get, "heavy", yaw),

  setBlocking: (on) =>
    set((s) => {
      if (s.player.action !== "idle" && s.player.action !== "block") return {};
      return { player: { ...s.player, action: on ? "block" : "idle", actionTimer: 0, actionTotal: 0 } };
    }),

  dodge: (dir, yaw) =>
    set((s) => {
      if (s.player.action !== "idle" && s.player.action !== "block") return {};
      audio.playSfx("dodge");
      const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const raw: Vec2 = {
        x: s.playerPos.x + right.x * dir * RANGE.dodgeDistance,
        z: s.playerPos.z + right.z * dir * RANGE.dodgeDistance,
      };
      const nextPos = resolveMove(raw, s.opponentPos);
      return {
        playerPos: nextPos,
        player: {
          ...s.player,
          action: "dodge",
          actionTimer: TIMING.dodge.duration,
          actionTotal: TIMING.dodge.duration,
          facingLean: dir,
        },
      };
    }),

  jump: () =>
    set((s) => {
      if (s.phase !== "fight" || s.paused) return {};
      if (s.playerY > 0.02) return {}; // already airborne
      return { playerVelY: JUMP.velocity };
    }),

  chargeStart: () =>
    set((s) => {
      if (s.player.meter < 100 || s.player.action !== "idle") return {};
      audio.playSfx("charge_rumble");
      audio.playVoiceLine(s.playerId);
      return {
        player: { ...s.player, action: "charge", chargeHeld: 0, interruptible: true },
        cameraState: "CINEMATIC_TRANSITION",
        cameraOwner: "player",
      };
    }),

  chargeRelease: () => {
    const s = get();
    if (s.player.action !== "charge") return;
    if (s.player.chargeHeld < TIMING.chargeMin) {
      // released too early - cancel, keep half meter
      set({
        player: { ...s.player, action: "idle", meter: Math.round(s.player.meter * 0.5), chargeHeld: 0 },
        cameraState: "FIRST_PERSON",
        cameraOwner: null,
      });
      return;
    }
    fireSpecial(set, get, "player");
  },

  // Free-camera FPS movement: forward/strafe are relative to where the
  // camera (yaw) is actually looking, not the opponent. This is the
  // player's OWN movement only — the opponent has an entirely independent
  // position driven by AI, so the player never moves on its own.
  moveAxis: (fwd, strafe, dtSec, yaw) =>
    set((s) => {
      if (s.phase !== "fight" || s.paused) return {};
      if (!(s.player.action === "idle" || s.player.action === "block")) return {};
      const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const speed = RANGE.playerSpeed * dtSec;
      const raw: Vec2 = {
        x: s.playerPos.x + (forward.x * fwd + right.x * strafe) * speed,
        z: s.playerPos.z + (forward.z * fwd + right.z * strafe) * speed,
      };
      const nextPos = resolveMove(raw, s.opponentPos);
      const lean = clamp(s.player.facingLean * 0.85 + strafe * 0.4, -1, 1);
      return { playerPos: nextPos, player: { ...s.player, facingLean: lean } };
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
    const stadiumFlash = Math.max(0, s.stadiumFlash - dtMs * 0.0015);

    let playerY = s.playerY;
    let playerVelY = s.playerVelY;
    if (playerY > 0 || playerVelY !== 0) {
      const dt = dtMs / 1000;
      playerVelY -= JUMP.gravity * dt;
      playerY = Math.max(0, playerY + playerVelY * dt);
      if (playerY === 0) playerVelY = 0;
    }

    const player = stepFighter(s.player, dtMs);
    const opponent = stepFighter(s.opponent, dtMs);

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
    if (winner) {
      phase = "result";
      audio.stopAmbient();
      audio.setThemeVolume(0.55);
    }

    set({ matchTime, screenShake, stadiumFlash, playerY, playerVelY, player, opponent, phase, winner });

    runLoot(set, get, dtMs);
    runAI(set, get, dtMs);
  },
}));

function normalize(x: number, z: number): Vec2 {
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

function stepFighter(f: FighterRuntime, dtMs: number): FighterRuntime {
  const gunCooldown = Math.max(0, f.gunCooldown - dtMs);
  const cooled = gunCooldown !== f.gunCooldown ? { gunCooldown } : null;

  if (f.action === "idle" || f.action === "block" || f.action === "ko") {
    return cooled ? { ...f, ...cooled } : f;
  }
  if (f.action === "charge") {
    return { ...f, ...cooled, chargeHeld: Math.min(TIMING.chargeMax, f.chargeHeld + dtMs) };
  }
  const timer = f.actionTimer - dtMs;
  if (timer > 0) return { ...f, ...cooled, actionTimer: timer };
  // Reload completing refills the magazine right as the action reverts to idle.
  const ammo = f.action === "reload" ? AMMO.magSize : f.ammo;
  return { ...f, ...cooled, action: "idle", actionTimer: 0, actionTotal: 0, ammo };
}

function attemptAttack(set: SetFn, get: GetFn, kind: "light" | "heavy", yaw: number) {
  const s = get();
  if (s.phase !== "fight" || s.paused) return;
  if (s.player.action !== "idle") return;
  const timing = attackTiming(kind, s.playerId);
  audio.unlock();

  // Resolve the hit THIS SAME TICK, using positions as they are right now —
  // no delayed re-check. The old system set a timeout at windup-start and
  // only tested range when it fired, so any movement in that gap (yours or
  // the AI's) could turn an on-target click into a silent whiff. The windup/
  // recovery timing still runs for the swing animation, but it's now purely
  // cosmetic and never gates whether the hit landed.
  set({
    player: { ...s.player, action: kind === "light" ? "attack_light" : "attack_heavy", actionTimer: timing.total, actionTotal: timing.total },
  });
  resolveSwing(set, get, "player", kind, yaw);
}

function resolveSwing(set: SetFn, get: GetFn, side: "player" | "opponent", kind: "light" | "heavy", attackerYaw?: number) {
  const s = get();
  const attacker = side === "player" ? s.player : s.opponent;
  const defender = side === "player" ? s.opponent : s.player;
  const attackerId = side === "player" ? s.playerId : s.opponentId;
  const defenderMove = defender.action;

  const attackerPos = side === "player" ? s.playerPos : s.opponentPos;
  const defenderPos = side === "player" ? s.opponentPos : s.playerPos;
  const dx = defenderPos.x - attackerPos.x;
  const dz = defenderPos.z - attackerPos.z;
  const distance = Math.hypot(dx, dz);
  if (distance > RANGE.reach) return;

  if (attackerYaw !== undefined) {
    // Player attack: must be roughly looking at the target (crosshair-ish,
    // not pixel-precise) — forward-from-yaw is (-sin(yaw),-cos(yaw)) (see
    // moveAxis), so the yaw that points AT (dx,dz) is atan2(-dx,-dz).
    const toTargetYaw = Math.atan2(-dx, -dz);
    let diff = toTargetYaw - attackerYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) > RANGE.facingConeRad) return;
  }

  const move = getPunchMove(attackerId, kind);
  const blocking = defenderMove === "block";
  const dmg = resolveDamage(move.damage, blocking, side === "opponent");

  const newHealth = clamp((defender.health - dmg) as number, 0, defender.maxHealth);
  const newAttackerMeter = meterAfterHit(attacker.meter, move.meterGain);
  const hitstun = kind === "light" ? TIMING.hitstun_light : TIMING.hitstun_heavy;

  audio.playSfx(blocking ? "block" : kind === "heavy" ? "hit_heavy" : "hit_light");
  if (attacker.meter < 100 && newAttackerMeter >= 100) audio.playSfx("meter_full");

  const defenderPatch: Partial<FighterRuntime> = blocking
    ? { health: newHealth }
    : { health: newHealth, action: "hitstun", actionTimer: hitstun, actionTotal: hitstun, chargeHeld: 0, hitToken: defender.hitToken + 1, combo: 0 };

  const defenderSide = side === "player" ? "opponent" : "player";
  const interruptedCharge = !blocking && defenderMove === "charge" && s.cameraOwner === defenderSide;
  if (interruptedCharge) {
    set({ cameraState: "FIRST_PERSON", cameraOwner: null });
  }

  if (side === "player") {
    set({
      opponent: { ...defender, ...defenderPatch },
      player: { ...attacker, meter: newAttackerMeter, combo: attacker.combo + 1 },
      screenShake: kind === "heavy" ? 0.4 : 0.2,
    });
  } else {
    set({
      player: { ...defender, ...defenderPatch },
      opponent: { ...attacker, meter: newAttackerMeter, combo: attacker.combo + 1 },
      screenShake: kind === "heavy" ? 0.4 : 0.2,
    });
  }
  pushHitEvent(set, get, blocking ? "block" : kind, side);
}

function pushHitEvent(set: SetFn, get: GetFn, kind: HitEvent["kind"], side: HitEvent["side"]) {
  const s = get();
  const events = [...s.hitEvents, { id: nextHitId(), kind, side, t: performance.now() }].slice(-12);
  set({ hitEvents: events });
}

function attemptShot(set: SetFn, get: GetFn, yaw: number) {
  const s = get();
  if (s.phase !== "fight" || s.paused) return;
  if (s.player.action !== "idle") return;
  if (s.player.gunCooldown > 0) return;
  if (s.player.ammo <= 0) {
    audio.playSfx("menu_select"); // dry-fire click — same "nothing happened" cue as a disabled menu action
    return;
  }
  audio.unlock();

  set({
    player: { ...s.player, action: "shoot", actionTimer: GUN.recoveryMs, actionTotal: GUN.recoveryMs, gunCooldown: GUN.cooldownMs, ammo: s.player.ammo - 1 },
  });
  resolveShot(set, get, "player", yaw);
}

/** Hitscan resolve — same instant-resolve rule as punches (see the note at
 * the top of lib/combat.ts): checked and applied the instant the trigger is
 * pulled, never re-tested after a delay. Always pushes a GunShot (hit or
 * miss) so GunTracer.tsx has something to draw either way — a shot that
 * goes nowhere should still visibly go somewhere. */
function resolveShot(set: SetFn, get: GetFn, side: "player" | "opponent", attackerYaw?: number) {
  const s = get();
  const attacker = side === "player" ? s.player : s.opponent;
  const defender = side === "player" ? s.opponent : s.player;
  const defenderMove = defender.action;

  const attackerPos = side === "player" ? s.playerPos : s.opponentPos;
  const defenderPos = side === "player" ? s.opponentPos : s.playerPos;
  const dx = defenderPos.x - attackerPos.x;
  const dz = defenderPos.z - attackerPos.z;
  const distance = Math.hypot(dx, dz);

  // Aim direction: the player's own camera yaw, or (for the AI, which has
  // no yaw of its own) straight at whoever it's shooting at — same
  // atan2(-dx,-dz) convention as the facing-cone check in resolveSwing.
  const toTargetYaw = Math.atan2(-dx, -dz);
  const aimYaw = attackerYaw ?? toTargetYaw;

  let hit = false;
  if (distance <= GUN.range) {
    if (attackerYaw !== undefined) {
      let diff = toTargetYaw - attackerYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      hit = Math.abs(diff) <= GUN.aimConeRad;
    } else {
      hit = true;
    }
  }

  const dirX = -Math.sin(aimYaw);
  const dirZ = -Math.cos(aimYaw);
  const travel = hit ? distance : GUN.range;
  const shot: GunShot = {
    id: nextGunShotId(),
    side,
    fromX: attackerPos.x,
    fromZ: attackerPos.z,
    toX: attackerPos.x + dirX * travel,
    toZ: attackerPos.z + dirZ * travel,
    hit,
    t: performance.now(),
  };
  set({ gunShots: [...get().gunShots, shot].slice(-16) });
  audio.playSfx("gunshot");

  if (!hit) return;

  const blocking = defenderMove === "block";
  const dmg = resolveDamage(GUN.damage, blocking, side === "opponent");
  const newHealth = clamp((defender.health - dmg) as number, 0, defender.maxHealth);
  const newAttackerMeter = meterAfterHit(attacker.meter, GUN.meterGain);

  audio.playSfx(blocking ? "block" : "hit_light");
  if (attacker.meter < 100 && newAttackerMeter >= 100) audio.playSfx("meter_full");

  const defenderPatch: Partial<FighterRuntime> = blocking
    ? { health: newHealth }
    : { health: newHealth, action: "hitstun", actionTimer: TIMING.hitstun_light, actionTotal: TIMING.hitstun_light, chargeHeld: 0, hitToken: defender.hitToken + 1, combo: 0 };

  const defenderSide = side === "player" ? "opponent" : "player";
  const interruptedCharge = !blocking && defenderMove === "charge" && s.cameraOwner === defenderSide;
  if (interruptedCharge) set({ cameraState: "FIRST_PERSON", cameraOwner: null });

  if (side === "player") {
    set({
      opponent: { ...defender, ...defenderPatch },
      player: { ...attacker, meter: newAttackerMeter, combo: attacker.combo + 1 },
      screenShake: 0.15,
    });
  } else {
    set({
      player: { ...defender, ...defenderPatch },
      opponent: { ...attacker, meter: newAttackerMeter, combo: attacker.combo + 1 },
      screenShake: 0.15,
    });
  }
  pushHitEvent(set, get, blocking ? "block" : "shoot", side);
}

function fireSpecial(set: SetFn, get: GetFn, side: "player" | "opponent") {
  const s = get();
  const fighter = side === "player" ? s.player : s.opponent;
  const characterId = side === "player" ? s.playerId : s.opponentId;
  const move = getSpecial(characterId);

  set({
    [side]: { ...fighter, action: "special", actionTimer: TIMING.specialRelease, actionTotal: TIMING.specialRelease, interruptible: false },
    cameraState: "SCRIPTED_SHOT",
    cameraOwner: side,
  });
  audio.playSfx("special_release");
  pushHitEvent(set, get, "special", side);

  window.setTimeout(() => {
    const cur = get();
    if (cur.phase !== "fight") return;
    const defender = side === "player" ? cur.opponent : cur.player;
    const dmg = resolveDamage(move.damage, defender.action === "block", side === "opponent");
    const newHealth = clamp(defender.health - dmg, 0, defender.maxHealth);
    const patch: Partial<FighterRuntime> =
      defender.action === "block"
        ? { health: newHealth }
        : { health: newHealth, action: "hitstun", actionTimer: TIMING.hitstun_heavy, actionTotal: TIMING.hitstun_heavy, hitToken: defender.hitToken + 1, combo: 0 };
    const attackerAfter = { ...(side === "player" ? cur.player : cur.opponent), action: "cooldown" as ActionState, actionTimer: TIMING.cooldown, actionTotal: TIMING.cooldown, meter: 0, chargeHeld: 0 };
    set({
      [side === "player" ? "opponent" : "player"]: { ...defender, ...patch },
      [side]: attackerAfter,
      cameraState: "RETURN_TRANSITION",
      screenShake: 1,
    });
    window.setTimeout(() => {
      if (get().phase !== "fight") return;
      set({ cameraState: "FIRST_PERSON", cameraOwner: null });
    }, 350);
  }, TIMING.specialRelease);
}

// --- Ground loot: periodic heal/stadium pickups ---
let lootClock = 0;
let lootNextSpawn = 8000;

function runLoot(set: SetFn, get: GetFn, dtMs: number) {
  lootClock += dtMs;
  const s = get();

  if (lootClock > lootNextSpawn && s.lootItems.length < 2) {
    lootNextSpawn = lootClock + 12000 + Math.random() * 8000;
    const bound = ARENA.radius - ARENA.moveMargin - 3;
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * bound;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      if (dist({ x, z }, s.playerPos) > 2.5 && dist({ x, z }, s.opponentPos) > 2.5) break;
    }
    const kind: LootItem["kind"] = Math.random() < 0.6 ? "heal" : "stadium";
    set({ lootItems: [...s.lootItems, { id: nextLootId(), kind, x, z, bornAt: lootClock }] });
  }

  if (s.lootItems.length === 0) return;
  let remaining = s.lootItems;
  let playerPatch: Partial<FighterRuntime> | null = null;
  let opponentPatch: Partial<FighterRuntime> | null = null;
  let stadiumFlash = s.stadiumFlash;

  for (const item of s.lootItems) {
    const pickedByPlayer = dist(s.playerPos, item) < LOOT_PICKUP_RADIUS;
    const pickedByOpponent = !pickedByPlayer && dist(s.opponentPos, item) < LOOT_PICKUP_RADIUS;
    if (!pickedByPlayer && !pickedByOpponent) continue;

    remaining = remaining.filter((l) => l.id !== item.id);
    audio.playSfx("meter_full");

    if (item.kind === "heal") {
      if (pickedByPlayer) {
        const healed = Math.min(s.player.maxHealth, s.player.health + Math.round(s.player.maxHealth * 0.18));
        playerPatch = { ...(playerPatch ?? {}), health: healed };
      } else {
        const healed = Math.min(s.opponent.maxHealth, s.opponent.health + Math.round(s.opponent.maxHealth * 0.18));
        opponentPatch = { ...(opponentPatch ?? {}), health: healed };
      }
    } else {
      stadiumFlash = 1;
    }
  }

  if (remaining !== s.lootItems || playerPatch || opponentPatch || stadiumFlash !== s.stadiumFlash) {
    set({
      lootItems: remaining,
      stadiumFlash,
      ...(playerPatch ? { player: { ...get().player, ...playerPatch } } : {}),
      ...(opponentPatch ? { opponent: { ...get().opponent, ...opponentPatch } } : {}),
    });
  }
}

// --- Opponent AI: independent movement + shoot/punch/block decisions ---
let aiNextDecision = 0;
let aiClock = 0;
let aiStrafeDir = 1;
let aiStrafeUntil = 0;
// The AI alternates between brawling in close and kiting at range, rather
// than always beelining to melee distance — makes the gun actually matter
// for the opponent too, not just the player.
let aiPreferredRange = 1.5;
let aiRangeUntil = 0;

function runAI(set: SetFn, get: GetFn, dtMs: number) {
  aiClock += dtMs;
  const s = get();
  if (s.opponent.action === "ko" || s.player.action === "ko") return;

  if (aiClock > aiRangeUntil) {
    aiRangeUntil = aiClock + 3000 + Math.random() * 4000;
    aiPreferredRange = Math.random() < 0.45 ? 1.5 : 6 + Math.random() * 5;
  }

  // Independent steering: approach/retreat to a preferred range, with
  // occasional lateral circling so it doesn't just walk straight in.
  if (s.opponent.action === "idle" || s.opponent.action === "block") {
    const toPlayer = normalize(s.playerPos.x - s.opponentPos.x, s.playerPos.z - s.opponentPos.z);
    const tangent = { x: -toPlayer.z, z: toPlayer.x };
    const d = dist(s.opponentPos, s.playerPos);

    if (aiClock > aiStrafeUntil) {
      aiStrafeUntil = aiClock + 1200 + Math.random() * 1800;
      aiStrafeDir = Math.random() < 0.5 ? -1 : 1;
    }

    const radial = d > aiPreferredRange + 0.5 ? 1 : d < aiPreferredRange - 0.5 ? -1 : 0;
    const speed = RANGE.aiSpeed * (dtMs / 1000);
    const raw: Vec2 = {
      x: s.opponentPos.x + (toPlayer.x * radial + tangent.x * aiStrafeDir * 0.55) * speed,
      z: s.opponentPos.z + (toPlayer.z * radial + tangent.z * aiStrafeDir * 0.55) * speed,
    };
    set({ opponentPos: resolveMove(raw, s.playerPos) });
  }

  if (aiClock < aiNextDecision) return;
  aiNextDecision = aiClock + 280 + Math.random() * 380;

  const cur = get();
  if (cur.opponent.action !== "idle") return;

  // charge special when meter full and healthy
  if (cur.opponent.meter >= 100 && Math.random() < 0.6) {
    audio.playSfx("charge_rumble");
    audio.playVoiceLine(cur.opponentId);
    set({ opponent: { ...cur.opponent, action: "charge", chargeHeld: 0 } });
    window.setTimeout(() => {
      const c2 = get();
      if (c2.phase !== "fight" || c2.opponent.action !== "charge") return;
      fireSpecial(set, get, "opponent");
    }, 900);
    return;
  }

  const d = dist(cur.opponentPos, cur.playerPos);
  const inMelee = d <= RANGE.reach;
  const inGunRange = d <= GUN.range;
  const gunReady = cur.opponent.gunCooldown <= 0 && cur.opponent.ammo > 0;
  const roll = Math.random();

  if (cur.player.action.startsWith("attack_") && inMelee && roll < 0.4) {
    set({ opponent: { ...cur.opponent, action: "block" } });
    window.setTimeout(() => {
      const c3 = get();
      if (c3.phase === "fight" && c3.opponent.action === "block") set({ opponent: { ...c3.opponent, action: "idle" } });
    }, 400 + Math.random() * 250);
    return;
  }

  // Out of ammo and not already reloading — top up rather than standing
  // there uselessly holding an empty gun.
  if (cur.opponent.ammo <= 0) {
    set({ opponent: { ...cur.opponent, action: "reload", actionTimer: AMMO.reloadMs, actionTotal: AMMO.reloadMs } });
    return;
  }

  // Prefer the gun outside melee range; still take the occasional pot-shot
  // even up close so it doesn't feel like the gun only exists offscreen.
  if (gunReady && inGunRange && (!inMelee || roll < 0.3) && roll < 0.8) {
    set({
      opponent: { ...cur.opponent, action: "shoot", actionTimer: GUN.recoveryMs, actionTotal: GUN.recoveryMs, gunCooldown: GUN.cooldownMs, ammo: cur.opponent.ammo - 1 },
    });
    resolveShot(set, get, "opponent");
    return;
  }

  if (inMelee && roll < 0.85) {
    const kind: "light" | "heavy" = roll < 0.55 ? "light" : "heavy";
    const timing = attackTiming(kind, cur.opponentId);
    set({
      opponent: { ...cur.opponent, action: kind === "light" ? "attack_light" : "attack_heavy", actionTimer: timing.total, actionTotal: timing.total },
    });
    // Same instant-resolve rule as the player — the AI is always facing the
    // player (MixamoFighter's facing logic), so it never needs a facing-
    // cone check of its own, just the reach check inside resolveSwing.
    resolveSwing(set, get, "opponent", kind);
  }
}

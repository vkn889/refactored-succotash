"use client";

import { create } from "zustand";
import { getCharacter } from "./combat";
import type { ActionState } from "./store";
import {
  BR_ATTACKS,
  BR_GROUND_Y,
  BR_ITEM_EFFECTS,
  BR_ITEM_MAX_ON_FIELD,
  BR_ITEM_SPAWN_INTERVAL_MS,
  BR_JUMP,
  BR_KILL_X,
  BR_KILL_Y,
  BR_MAX_HEALTH,
  BR_MAX_PLAYERS,
  BR_MOVE_SPEED,
  BR_PLATFORMS,
  BR_RESPAWN_INVULN_MS,
  BR_RESPAWN_Y,
  BR_SPAWN_X,
  BR_SPECIAL,
  BR_STOCKS,
  pickWeightedItem,
  type BRItemKind,
} from "./battleRoyale";

// Battle Royale's own store — deliberately NOT a generalization of
// lib/store.ts's 1v1 GameState (see lib/battleRoyale.ts's top comment for
// why this stays fully separate). Same host-authoritative shape as 1v1
// online (see lib/onlineBR.ts): only the host ever calls tick(); every
// other connected client's store is a pure mirror applied wholesale via
// applyBRSnapshot.

// No separate character-select phase — picking a fighter happens right in
// the lobby (each connected player claims one inline, host starts once
// enough people are both connected and have picked), one less screen to
// route through.
export type BRPhase = "lobby" | "fight" | "result";

export interface BRFighter {
  slot: number;
  clientId: string | null;
  characterId: string | null;
  connected: boolean;
  x: number;
  y: number; // world units, DOWN from the top of the playable area — see BR_GROUND_Y/BR_KILL_Y
  vx: number;
  vy: number;
  onPlatform: number | null; // index into BR_PLATFORMS, or null while airborne
  airJumps: number;
  facing: 1 | -1;
  action: ActionState;
  actionTimer: number;
  actionTotal: number;
  health: number;
  maxHealth: number;
  meter: number;
  stocks: number;
  eliminated: boolean;
  invulnMs: number;
  hitToken: number;
  buff: { kind: "damage_boost" | "speed_boost" | "shield" | "star"; msLeft: number } | null;
  moveDir: -1 | 0 | 1;
  blocking: boolean;
}

export interface BRItemEntity {
  id: number;
  kind: BRItemKind;
  x: number;
  y: number;
}

export interface BRProjectile {
  id: number;
  kind: "bomb" | "freeze_trap";
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerSlot: number;
  lifeMs: number;
}

interface BRState {
  phase: BRPhase;
  roomCode: string | null;
  isHost: boolean;
  localClientId: string | null;
  localSlot: number | null;
  fighters: BRFighter[];
  items: BRItemEntity[];
  projectiles: BRProjectile[];
  winnerSlot: number | null;
  itemSpawnTimer: number;

  resetRoom: () => void;
  setRoom: (code: string, isHost: boolean, localClientId: string) => void;
  setLocalSlot: (slot: number) => void;
  ensureSlot: (clientId: string) => number | null; // host only — assigns/returns a slot for a newly-seen client
  claimCharacter: (slot: number, characterId: string) => void;
  removeClient: (clientId: string) => void; // host only — frees a slot on disconnect
  startFight: () => void; // host only

  // per-slot input (host applies these directly for its own local slot,
  // and via lib/onlineBR.ts for every remote slot's relayed messages)
  setMoveDir: (slot: number, dir: -1 | 0 | 1) => void;
  jump: (slot: number) => void;
  punch: (slot: number) => void;
  kick: (slot: number) => void;
  setBlocking: (slot: number, on: boolean) => void;
  special: (slot: number) => void;

  tick: (dtMs: number) => void; // host only
  applySnapshot: (snap: Partial<BRState>) => void; // non-host: mirror the host's broadcast
}

function freshFighter(slot: number): BRFighter {
  return {
    slot,
    clientId: null,
    characterId: null,
    connected: false,
    x: BR_SPAWN_X[slot] ?? 0,
    y: BR_GROUND_Y,
    vx: 0,
    vy: 0,
    onPlatform: 0,
    airJumps: 0,
    facing: 1,
    action: "idle",
    actionTimer: 0,
    actionTotal: 0,
    health: BR_MAX_HEALTH,
    maxHealth: BR_MAX_HEALTH,
    meter: 0,
    stocks: BR_STOCKS,
    eliminated: false,
    invulnMs: 0,
    hitToken: 0,
    buff: null,
    moveDir: 0,
    blocking: false,
  };
}

let nextItemId = 1;
let nextProjectileId = 1;
// Per-pair timer so a Mog Star's contact aura ticks damage at a steady
// rate instead of once per frame — keyed "attackerSlot:victimSlot".
const starAuraTimers = new Map<string, number>();

export const useBRStore = create<BRState>((set, get) => ({
  phase: "lobby",
  roomCode: null,
  isHost: false,
  localClientId: null,
  localSlot: null,
  fighters: Array.from({ length: BR_MAX_PLAYERS }, (_, i) => freshFighter(i)),
  items: [],
  projectiles: [],
  winnerSlot: null,
  itemSpawnTimer: BR_ITEM_SPAWN_INTERVAL_MS,

  resetRoom: () =>
    set({
      phase: "lobby",
      roomCode: null,
      isHost: false,
      localClientId: null,
      localSlot: null,
      fighters: Array.from({ length: BR_MAX_PLAYERS }, (_, i) => freshFighter(i)),
      items: [],
      projectiles: [],
      winnerSlot: null,
      itemSpawnTimer: BR_ITEM_SPAWN_INTERVAL_MS,
    }),

  setRoom: (code, isHost, localClientId) => set({ roomCode: code, isHost, localClientId, phase: "lobby" }),
  setLocalSlot: (slot) => set({ localSlot: slot }),

  ensureSlot: (clientId) => {
    const s = get();
    const existing = s.fighters.find((f) => f.clientId === clientId);
    if (existing) return existing.slot;
    const free = s.fighters.find((f) => !f.connected);
    if (!free) return null; // room full
    set({ fighters: s.fighters.map((f) => (f.slot === free.slot ? { ...f, clientId, connected: true } : f)) });
    return free.slot;
  },

  claimCharacter: (slot, characterId) =>
    set((s) => ({ fighters: s.fighters.map((f) => (f.slot === slot ? { ...f, characterId } : f)) })),

  removeClient: (clientId) =>
    set((s) => ({
      fighters: s.fighters.map((f) => (f.clientId === clientId ? { ...freshFighter(f.slot) } : f)),
    })),

  startFight: () => {
    const s = get();
    const active = s.fighters.filter((f) => f.connected && f.characterId);
    set({
      phase: "fight",
      winnerSlot: null,
      items: [],
      projectiles: [],
      itemSpawnTimer: BR_ITEM_SPAWN_INTERVAL_MS,
      fighters: s.fighters.map((f) => {
        if (!active.includes(f)) return f;
        return {
          ...freshFighter(f.slot),
          clientId: f.clientId,
          characterId: f.characterId,
          connected: true,
        };
      }),
    });
  },

  setMoveDir: (slot, dir) => set((s) => ({ fighters: patchSlot(s.fighters, slot, { moveDir: dir }) })),

  jump: (slot) =>
    set((s) => {
      const f = s.fighters[slot];
      if (!f || f.eliminated || (f.action !== "idle" && f.action !== "walk")) return {};
      const grounded = f.onPlatform !== null;
      if (!grounded && f.airJumps <= 0) return {};
      return {
        fighters: patchSlot(s.fighters, slot, {
          vy: -BR_JUMP.velocity,
          onPlatform: null,
          airJumps: grounded ? f.airJumps : f.airJumps - 1,
        }),
      };
    }),

  punch: (slot) => attemptBRAttack(set, get, slot, "punch"),
  kick: (slot) => attemptBRAttack(set, get, slot, "kick"),

  setBlocking: (slot, on) =>
    set((s) => {
      const f = s.fighters[slot];
      if (!f || f.eliminated) return {};
      if (on && (f.action === "idle" || f.action === "walk")) {
        return { fighters: patchSlot(s.fighters, slot, { action: "block", blocking: true, actionTimer: 0, actionTotal: 0 }) };
      }
      if (!on && f.action === "block") {
        return { fighters: patchSlot(s.fighters, slot, { action: "idle", blocking: false }) };
      }
      return { fighters: patchSlot(s.fighters, slot, { blocking: on }) };
    }),

  special: (slot) => {
    const s = get();
    const f = s.fighters[slot];
    if (!f || f.eliminated || f.meter < BR_SPECIAL.meterNeeded) return;
    if (f.action !== "idle" && f.action !== "walk") return;
    set({ fighters: patchSlot(s.fighters, slot, { action: "special", actionTimer: BR_SPECIAL.windup, actionTotal: BR_SPECIAL.windup, meter: 0 }) });
    window.setTimeout(() => {
      const cur = get();
      const attacker = cur.fighters[slot];
      if (!attacker || cur.phase !== "fight") return;
      let fighters = cur.fighters;
      for (const other of cur.fighters) {
        if (other.slot === attacker.slot || other.eliminated || !other.characterId) continue;
        const dx = other.x - attacker.x;
        const dy = other.y - attacker.y;
        if (Math.hypot(dx, dy) > 2.4) continue;
        fighters = damageFighter(fighters, other.slot, BR_SPECIAL.damage, Math.sign(dx) || 1, BR_SPECIAL.knockback, attacker.buff?.kind === "damage_boost");
      }
      set({ fighters: patchSlot(fighters, slot, { action: "cooldown", actionTimer: 260, actionTotal: 260 }) });
    }, BR_SPECIAL.windup);
  },

  tick: (dtMs) => {
    const s = get();
    if (s.phase !== "fight") return;
    const dt = dtMs / 1000;
    let fighters = s.fighters.map((f) => stepBRFighter(f, dtMs, dt));
    fighters = fighters.map((f) => applyBRPhysics(f, dtMs, dt));

    // items: spawn + pickup
    let items = s.items;
    let itemSpawnTimer = s.itemSpawnTimer - dtMs;
    if (itemSpawnTimer <= 0 && items.length < BR_ITEM_MAX_ON_FIELD) {
      itemSpawnTimer = BR_ITEM_SPAWN_INTERVAL_MS;
      const plat = BR_PLATFORMS[Math.floor(Math.random() * BR_PLATFORMS.length)];
      items = [...items, { id: nextItemId++, kind: pickWeightedItem(), x: plat.x + (Math.random() - 0.5) * plat.w * 0.7, y: plat.y }];
    }
    const remainingItems: BRItemEntity[] = [];
    const spawnedProjectiles: BRProjectile[] = [];
    for (const item of items) {
      const holder = fighters.find((f) => !f.eliminated && f.characterId && Math.hypot(f.x - item.x, f.y - item.y) < 0.75);
      if (holder) {
        const result = applyBRItem(fighters, holder.slot, item.kind);
        fighters = result.fighters;
        if (result.projectile) spawnedProjectiles.push(result.projectile);
      } else {
        remainingItems.push(item);
      }
    }
    items = remainingItems;

    // projectiles (bombs / freeze traps)
    let projectiles = s.projectiles;
    const nextProjectiles: BRProjectile[] = [];
    for (const p of projectiles) {
      const np = { ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, lifeMs: p.lifeMs - dtMs };
      let consumed = false;
      for (const f of fighters) {
        if (f.eliminated || !f.characterId || f.slot === p.ownerSlot) continue;
        if (Math.hypot(f.x - np.x, f.y - np.y) < 0.55) {
          fighters = applyBRProjectileHit(fighters, f.slot, p);
          consumed = true;
          break;
        }
      }
      if (!consumed && np.lifeMs > 0 && np.y < BR_KILL_Y) nextProjectiles.push(np);
    }
    projectiles = [...nextProjectiles, ...spawnedProjectiles];

    // Mog Star contact aura
    for (const attacker of fighters) {
      if (!attacker.buff || attacker.buff.kind !== "star" || attacker.eliminated) continue;
      for (const victim of fighters) {
        if (victim.slot === attacker.slot || victim.eliminated || !victim.characterId || victim.invulnMs > 0) continue;
        if (Math.hypot(victim.x - attacker.x, victim.y - attacker.y) > 0.9) continue;
        const key = `${attacker.slot}:${victim.slot}`;
        const last = starAuraTimers.get(key) ?? 0;
        if (performance.now() - last > 350) {
          starAuraTimers.set(key, performance.now());
          fighters = damageFighter(fighters, victim.slot, BR_ITEM_EFFECTS.starAuraDamage, Math.sign(victim.x - attacker.x) || 1, 0.3, false);
        }
      }
    }

    // fall-off / KO-plane check, respawn handling — the floor (see
    // BR_PLATFORMS) catches any straight-down fall, so the only real ways
    // to lose a stock here are getting knocked off the SIDES past
    // BR_KILL_X (classic side-blast-zone ring-out) or health hitting 0.
    fighters = fighters.map((f) => {
      if (f.eliminated || !f.characterId) return f;
      if (f.y > BR_KILL_Y || Math.abs(f.x) > BR_KILL_X || f.health <= 0) return loseStock(f);
      return f;
    });

    // win condition
    const alive = fighters.filter((f) => f.characterId && !f.eliminated);
    let phase: BRPhase = s.phase;
    let winnerSlot = s.winnerSlot;
    const totalEntrants = fighters.filter((f) => f.characterId).length;
    if (totalEntrants >= 2 && alive.length <= 1 && winnerSlot === null) {
      winnerSlot = alive[0]?.slot ?? null;
      phase = "result";
    }

    set({ fighters, items, projectiles, itemSpawnTimer, phase, winnerSlot });
  },

  applySnapshot: (snap) => set(snap),
}));

function patchSlot(fighters: BRFighter[], slot: number, patch: Partial<BRFighter>): BRFighter[] {
  return fighters.map((f) => (f.slot === slot ? { ...f, ...patch } : f));
}

// --- combat -----------------------------------------------------------

function attemptBRAttack(set: (fn: (s: BRState) => Partial<BRState>) => void, get: () => BRState, slot: number, kind: "punch" | "kick") {
  const s = get();
  const attacker = s.fighters[slot];
  if (!attacker || attacker.eliminated || !attacker.characterId) return;
  if (attacker.action !== "idle" && attacker.action !== "walk") return;
  const move = BR_ATTACKS[kind];
  set(() => {
    let fighters = patchSlot(s.fighters, slot, {
      action: kind,
      actionTimer: move.windup + move.active + move.recovery,
      actionTotal: move.windup + move.active + move.recovery,
    });
    // Instant-resolve, same discipline as the 1v1 engine: the hit lands
    // (or doesn't) using positions as they are right now, no delayed
    // re-check for the swing's own windup/recovery to gate.
    let best: BRFighter | null = null;
    let bestDist = Infinity;
    for (const other of fighters) {
      if (other.slot === slot || other.eliminated || !other.characterId) continue;
      const dx = other.x - attacker.x;
      const dy = other.y - attacker.y;
      if (Math.abs(dy) > 1.3) continue; // roughly the same platform/height
      if (Math.sign(dx || 1) !== attacker.facing) continue; // has to actually be in front
      const dist = Math.abs(dx);
      if (dist > move.reach) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = other;
      }
    }
    if (best) {
      const boosted = attacker.buff?.kind === "damage_boost";
      fighters = damageFighter(fighters, best.slot, move.damage, attacker.facing, move.knockback, boosted);
    }
    return { fighters };
  });
}

function damageFighter(fighters: BRFighter[], slot: number, rawDamage: number, knockbackDir: number, knockback: number, boosted: boolean): BRFighter[] {
  const f = fighters[slot];
  if (!f || f.eliminated || f.invulnMs > 0) return fighters;
  const shielded = f.buff?.kind === "shield" || f.buff?.kind === "star";
  if (shielded) return fighters;
  const dmg = Math.round(rawDamage * (boosted ? BR_ITEM_EFFECTS.damageBoostMult : 1));
  const health = Math.max(0, f.health - dmg);
  return patchSlot(fighters, slot, {
    health,
    action: "hitstun",
    actionTimer: 260,
    actionTotal: 260,
    hitToken: f.hitToken + 1,
    vx: knockbackDir * knockback * 6,
    vy: -knockback * 2.5,
    onPlatform: null,
  });
}

function loseStock(f: BRFighter): BRFighter {
  const stocks = f.stocks - 1;
  if (stocks <= 0) {
    return { ...f, stocks: 0, eliminated: true, action: "ko", health: 0 };
  }
  return {
    ...f,
    stocks,
    health: f.maxHealth,
    x: BR_SPAWN_X[f.slot] ?? 0,
    y: BR_RESPAWN_Y,
    vx: 0,
    vy: 0,
    onPlatform: null,
    invulnMs: BR_RESPAWN_INVULN_MS,
    action: "idle",
    actionTimer: 0,
    buff: null,
  };
}

// --- movement / physics -------------------------------------------------

function stepBRFighter(f: BRFighter, dtMs: number, dt: number): BRFighter {
  if (f.eliminated || !f.characterId) return f;
  let next = f;

  if (next.invulnMs > 0) next = { ...next, invulnMs: Math.max(0, next.invulnMs - dtMs) };
  if (next.buff) {
    const msLeft = next.buff.msLeft - dtMs;
    next = { ...next, buff: msLeft > 0 ? { ...next.buff, msLeft } : null };
  }

  // action-timer decay, same "revert to idle once it runs out" rule as 1v1
  if (next.action !== "idle" && next.action !== "walk" && next.action !== "block") {
    const timer = next.actionTimer - dtMs;
    next = timer > 0 ? { ...next, actionTimer: timer } : { ...next, action: "idle", actionTimer: 0, actionTotal: 0 };
  }

  // horizontal movement — only from idle/walk, same gating as 1v1
  if (next.moveDir !== 0 && (next.action === "idle" || next.action === "walk")) {
    const speedMult = next.buff?.kind === "speed_boost" ? BR_ITEM_EFFECTS.speedBoostMult : 1;
    const nextX = next.x + next.moveDir * BR_MOVE_SPEED * speedMult * dt;
    next = { ...next, x: nextX, action: "walk", facing: next.moveDir as 1 | -1 };
  } else if (next.action === "walk") {
    next = { ...next, action: "idle" };
  }

  return next;
}

function applyBRPhysics(f: BRFighter, dtMs: number, dt: number): BRFighter {
  if (f.eliminated || !f.characterId) return f;
  let vy = f.vy;
  let y = f.y;
  let onPlatform = f.onPlatform;

  // horizontal knockback decay (from a landed hit) — bleeds off quickly so
  // it reads as a real impulse, not a permanent speed change
  let vx = f.vx;
  if (vx !== 0) vx = Math.abs(vx) < 0.3 ? 0 : vx * 0.9;
  const x = f.x + vx * dt;

  vy += BR_JUMP.gravity * dt;
  const prevY = y;
  y += vy * dt;

  // platform collision: one-way (land only while falling, from above) for
  // floaters; the main platform additionally hard-clamps so nothing ever
  // tunnels through it even at high fall speed.
  onPlatform = null;
  for (let i = 0; i < BR_PLATFORMS.length; i++) {
    const plat = BR_PLATFORMS[i];
    const withinX = x > plat.x - plat.w / 2 && x < plat.x + plat.w / 2;
    if (!withinX) continue;
    const crossedFromAbove = vy >= 0 && prevY <= plat.y && y >= plat.y;
    const tunneling = plat.solid && y > plat.y;
    if (crossedFromAbove || tunneling) {
      y = plat.y;
      vy = 0;
      onPlatform = i;
      break;
    }
  }

  return { ...f, x, y, vx, vy, onPlatform, airJumps: onPlatform !== null ? 1 : f.airJumps };
}

// --- items ---------------------------------------------------------------

function applyBRItem(fighters: BRFighter[], slot: number, kind: BRItemKind): { fighters: BRFighter[]; projectile?: BRProjectile } {
  const f = fighters[slot];
  const fx = BR_ITEM_EFFECTS;
  switch (kind) {
    case "heal":
      return { fighters: patchSlot(fighters, slot, { health: Math.min(f.maxHealth, f.health + fx.healAmount) }) };
    case "mega_heal":
      return { fighters: patchSlot(fighters, slot, { health: Math.min(f.maxHealth, f.health + fx.megaHealAmount) }) };
    case "damage_boost":
      return { fighters: patchSlot(fighters, slot, { buff: { kind: "damage_boost", msLeft: fx.damageBoostMs } }) };
    case "shield":
      return { fighters: patchSlot(fighters, slot, { buff: { kind: "shield", msLeft: fx.shieldMs } }) };
    case "speed_boost":
      return { fighters: patchSlot(fighters, slot, { buff: { kind: "speed_boost", msLeft: fx.speedBoostMs } }) };
    case "star":
      return { fighters: patchSlot(fighters, slot, { buff: { kind: "star", msLeft: fx.starMs }, invulnMs: fx.starMs }) };
    case "spring":
      return { fighters: patchSlot(fighters, slot, { vy: -fx.springLaunchVel, onPlatform: null }) };
    case "bomb": {
      const proj: BRProjectile = { id: nextProjectileId++, kind: "bomb", x: f.x, y: f.y - 0.4, vx: f.facing * fx.bombSpeed, vy: -1.5, ownerSlot: slot, lifeMs: 2200 };
      return { fighters, projectile: proj };
    }
    case "freeze_trap": {
      const proj: BRProjectile = { id: nextProjectileId++, kind: "freeze_trap", x: f.x, y: f.y - 0.4, vx: f.facing * fx.freezeSpeed, vy: 0, ownerSlot: slot, lifeMs: 2200 };
      return { fighters, projectile: proj };
    }
  }
}

function applyBRProjectileHit(fighters: BRFighter[], slot: number, p: BRProjectile): BRFighter[] {
  const fx = BR_ITEM_EFFECTS;
  if (p.kind === "bomb") {
    let next = fighters;
    for (const f of fighters) {
      if (f.eliminated || !f.characterId) continue;
      if (Math.hypot(f.x - p.x, f.y - p.y) > fx.bombRadius) continue;
      next = damageFighter(next, f.slot, fx.bombDamage, Math.sign(f.x - p.x) || 1, 1.4, false);
    }
    return next;
  }
  // freeze_trap — no damage, just a long hitstun (frozen in place) and a
  // lingering slow once they thaw, reusing the same "hitstun" action a
  // real hit already uses rather than adding a whole new frozen state.
  const f = fighters[slot];
  if (!f || f.invulnMs > 0 || f.buff?.kind === "shield" || f.buff?.kind === "star") return fighters;
  return patchSlot(fighters, slot, { action: "hitstun", actionTimer: fx.freezeStunMs, actionTotal: fx.freezeStunMs, hitToken: f.hitToken + 1 });
}

export function getCharacterSafe(id: string | null) {
  if (!id) return null;
  return getCharacter(id);
}

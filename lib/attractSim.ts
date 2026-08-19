import { TIMING, RANGE, resolveDamage } from "./combat";
import type { ActionState } from "./store";
import type { FighterFrame } from "./fighterFrame";

// A tiny, self-contained two-AI combat loop used only for the home-screen
// attract-mode fight. Deliberately independent of the real Zustand game
// store — this never touches match state, so it can run forever in the
// background without any risk of leaking into an actual match.

interface Side {
  x: number;
  z: number;
  action: ActionState;
  actionTotal: number;
  actionTimer: number;
  chargeHeld: number;
  health: number;
  meter: number;
  hitToken: number;
  nextDecision: number;
}

function freshSide(x: number, z: number): Side {
  return { x, z, action: "idle", actionTotal: 0, actionTimer: 0, chargeHeld: 0, health: 1000, meter: 0, hitToken: 0, nextDecision: 0 };
}

function attackTiming(kind: "light" | "heavy") {
  const t = TIMING[kind];
  return { windup: t.windup, active: t.active, recovery: t.recovery, total: t.windup + t.active + t.recovery };
}

function step(f: Side, dtMs: number): Side {
  if (f.action === "idle" || f.action === "block") return f;
  if (f.action === "charge") return { ...f, chargeHeld: Math.min(TIMING.chargeMax, f.chargeHeld + dtMs) };
  const timer = f.actionTimer - dtMs;
  if (timer > 0) return { ...f, actionTimer: timer };
  return { ...f, action: "idle", actionTimer: 0, actionTotal: 0 };
}

export class AttractSim {
  a: Side;
  b: Side;
  private clock = 0;
  private pendingResolves: { at: number; attacker: "a" | "b"; kind: "light" | "heavy" }[] = [];
  private pendingSpecials: { at: number; side: "a" | "b" }[] = [];

  constructor() {
    this.a = freshSide(0, 2.2);
    this.b = freshSide(0, -2.2);
    this.a.nextDecision = 600;
    this.b.nextDecision = 1100;
  }

  tick(dtMs: number) {
    this.clock += dtMs;
    this.a = step(this.a, dtMs);
    this.b = step(this.b, dtMs);

    for (const p of this.pendingResolves.slice()) {
      if (this.clock >= p.at) {
        this.resolveSwing(p.attacker, p.kind);
        this.pendingResolves = this.pendingResolves.filter((x) => x !== p);
      }
    }
    for (const p of this.pendingSpecials.slice()) {
      if (this.clock >= p.at) {
        this.resolveSpecial(p.side);
        this.pendingSpecials = this.pendingSpecials.filter((x) => x !== p);
      }
    }

    this.steer(this.a, this.b);
    this.steer(this.b, this.a);
    this.decide("a");
    this.decide("b");

    if (this.a.health <= 0 || this.b.health <= 0) {
      const ax = this.a.x;
      const az = this.a.z;
      const bx = this.b.x;
      const bz = this.b.z;
      this.a = freshSide(ax, az);
      this.b = freshSide(bx, bz);
    }
  }

  private steer(self: Side, other: Side) {
    if (self.action !== "idle" && self.action !== "block") return;
    const dx = other.x - self.x;
    const dz = other.z - self.z;
    const len = Math.hypot(dx, dz) || 1;
    const toOther = { x: dx / len, z: dz / len };
    const tangent = { x: -toOther.z, z: toOther.x };
    const preferred = 1.7;
    const radial = len > preferred + 0.4 ? 1 : len < preferred - 0.4 ? -1 : 0;
    const strafe = Math.sin(this.clock * 0.0004 + (self === this.a ? 0 : Math.PI)) > 0 ? 1 : -1;
    const speed = (RANGE.aiSpeed * 0.85 * 16) / 1000;
    self.x += (toOther.x * radial + tangent.x * strafe * 0.5) * speed;
    self.z += (toOther.z * radial + tangent.z * strafe * 0.5) * speed;
  }

  private decide(key: "a" | "b") {
    const self = key === "a" ? this.a : this.b;
    const other = key === "a" ? this.b : this.a;
    if (this.clock < self.nextDecision) return;
    self.nextDecision = this.clock + 500 + Math.random() * 700;
    if (self.action !== "idle") return;

    if (self.meter >= 100 && Math.random() < 0.5) {
      self.action = "charge";
      self.chargeHeld = 0;
      this.pendingSpecials.push({ at: this.clock + 900, side: key });
      return;
    }

    const d = Math.hypot(other.x - self.x, other.z - self.z);
    const roll = Math.random();
    if (other.action.startsWith("attack_") && d <= RANGE.reach && roll < 0.35) {
      self.action = "block";
      window.setTimeout(() => {
        if (self.action === "block") self.action = "idle";
      }, 400 + Math.random() * 250);
      return;
    }
    if (d <= RANGE.reach && roll < 0.7) {
      const kind: "light" | "heavy" = roll < 0.45 ? "light" : "heavy";
      const timing = attackTiming(kind);
      self.action = kind === "light" ? "attack_light" : "attack_heavy";
      self.actionTotal = timing.total;
      self.actionTimer = timing.total;
      this.pendingResolves.push({ at: this.clock + timing.windup, attacker: key, kind });
    }
  }

  private resolveSwing(attackerKey: "a" | "b", kind: "light" | "heavy") {
    const attacker = attackerKey === "a" ? this.a : this.b;
    const defender = attackerKey === "a" ? this.b : this.a;
    const d = Math.hypot(attacker.x - defender.x, attacker.z - defender.z);
    if (d > RANGE.reach) return;
    const blocking = defender.action === "block";
    const dmg = resolveDamage(kind === "light" ? 20 : 40, blocking);
    defender.health = Math.max(0, defender.health - dmg);
    attacker.meter = Math.min(100, attacker.meter + (kind === "light" ? 6 : 11));
    if (!blocking) {
      defender.action = "hitstun";
      defender.actionTotal = kind === "light" ? TIMING.hitstun_light : TIMING.hitstun_heavy;
      defender.actionTimer = defender.actionTotal;
      defender.hitToken += 1;
    }
  }

  private resolveSpecial(key: "a" | "b") {
    const self = key === "a" ? this.a : this.b;
    const other = key === "a" ? this.b : this.a;
    self.action = "special";
    self.actionTotal = TIMING.specialRelease;
    self.actionTimer = TIMING.specialRelease;
    window.setTimeout(() => {
      const dmg = resolveDamage(220, other.action === "block");
      other.health = Math.max(0, other.health - dmg);
      if (other.action !== "block") {
        other.action = "hitstun";
        other.actionTotal = TIMING.hitstun_heavy;
        other.actionTimer = TIMING.hitstun_heavy;
        other.hitToken += 1;
      }
      self.action = "cooldown";
      self.actionTotal = TIMING.cooldown;
      self.actionTimer = TIMING.cooldown;
      self.meter = 0;
    }, TIMING.specialRelease);
  }

  frame(key: "a" | "b"): FighterFrame {
    const self = key === "a" ? this.a : this.b;
    const other = key === "a" ? this.b : this.a;
    return {
      action: self.action,
      actionTotal: self.actionTotal,
      actionTimer: self.actionTimer,
      chargeHeld: self.chargeHeld,
      meter: self.meter,
      x: self.x,
      z: self.z,
      faceX: other.x,
      faceZ: other.z,
      hitToken: self.hitToken,
    };
  }
}

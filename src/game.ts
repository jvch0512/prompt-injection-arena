import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { LEVELS, respond, type Level, type Reply } from "./model.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** A fresh random secret per session and level, so nothing in the source code reveals a flag. */
export function newSecret(): string {
  let s = "ARENA-";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export interface Session {
  id: string;
  created: number;
  secrets: string[];
  solved: Set<number>;
  attempts: number[];
  hintsUsed: number[];
  window: number[]; // timestamps for rate limiting
}

export const LIMITS = { message: 600, document: 3000, perMinute: 60, maxSessions: 2000, flagLen: 64 };

export class Game {
  private sessions = new Map<string, Session>();

  create(): Session {
    if (this.sessions.size >= LIMITS.maxSessions) this.sessions.delete(this.sessions.keys().next().value as string);
    const s: Session = {
      id: randomBytes(18).toString("base64url"), created: Date.now(), secrets: LEVELS.map(() => newSecret()),
      solved: new Set(), attempts: LEVELS.map(() => 0), hintsUsed: LEVELS.map(() => 0), window: [],
    };
    this.sessions.set(s.id, s);
    return s;
  }

  get(id: string | undefined): Session | undefined {
    return id ? this.sessions.get(id) : undefined;
  }

  level(n: unknown): Level | undefined {
    return Number.isInteger(n) ? LEVELS.find((l) => l.id === n) : undefined;
  }

  allowed(s: Session, now = Date.now()): boolean {
    s.window = s.window.filter((t) => now - t < 60_000);
    if (s.window.length >= LIMITS.perMinute) return false;
    s.window.push(now);
    return true;
  }

  chat(s: Session, level: Level, message: string, doc: string): Reply {
    s.attempts[level.id - 1]!++;
    return respond(level, s.secrets[level.id - 1]!, message, level.docMode ? doc : "");
  }

  submit(s: Session, level: Level, flag: string): boolean {
    const real = Buffer.from(s.secrets[level.id - 1]!);
    const given = Buffer.from(flag.trim());
    const ok = given.length === real.length && timingSafeEqual(given, real);
    if (ok) s.solved.add(level.id);
    return ok;
  }
}

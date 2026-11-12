import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Game, LIMITS, type Session } from "./game.js";
import { LEVELS } from "./model.js";
import { runRedTeam } from "./redteam.js";

const PUBLIC = resolve(fileURLToPath(new URL("../../public", import.meta.url)));
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; base-uri 'none'", ...extra,
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, max = 8192): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) return null;
    chunks.push(c as Buffer);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch { return null; }
}

function cookieSid(req: IncomingMessage): string | undefined {
  return /(?:^|;\s*)sid=([A-Za-z0-9_-]+)/.exec(req.headers.cookie ?? "")?.[1];
}

export function createApp(game = new Game()): Server {
  const session = (req: IncomingMessage, res: ServerResponse): { s: Session; headers: Record<string, string> } => {
    const existing = game.get(cookieSid(req));
    if (existing) return { s: existing, headers: {} };
    const s = game.create();
    return { s, headers: { "Set-Cookie": `sid=${s.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400` } };
  };

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      if (path === "/api/levels" && req.method === "GET") {
        const { s, headers } = session(req, res);
        return send(res, 200, LEVELS.map((l) => ({
          id: l.id, title: l.title, scenario: l.scenario, objective: l.objective, docMode: l.docMode,
          defenses: { input: l.inputBlocks.length > 0, output: l.outputFilters.length > 0, refuses: l.refuseDirect },
          solved: s.solved.has(l.id), attempts: s.attempts[l.id - 1],
        })), headers);
      }
      if (path === "/api/chat" && req.method === "POST") {
        const { s, headers } = session(req, res);
        const body = await readJson(req);
        const level = game.level(body?.level);
        if (!body || !level || typeof body.message !== "string" || body.message.length === 0) return send(res, 400, { error: "level and message are required" }, headers);
        const doc = typeof body.document === "string" ? body.document : "";
        if (body.message.length > LIMITS.message || doc.length > LIMITS.document) return send(res, 413, { error: `message max ${LIMITS.message} chars, document max ${LIMITS.document}` }, headers);
        if (!game.allowed(s)) return send(res, 429, { error: "slow down: 60 messages per minute" }, headers);
        return send(res, 200, game.chat(s, level, body.message, doc), headers);
      }
      if (path === "/api/submit" && req.method === "POST") {
        const { s, headers } = session(req, res);
        const body = await readJson(req);
        const level = game.level(body?.level);
        if (!body || !level || typeof body.flag !== "string" || body.flag.length > LIMITS.flagLen) return send(res, 400, { error: "level and flag are required" }, headers);
        if (!game.allowed(s)) return send(res, 429, { error: "slow down" }, headers);
        const ok = game.submit(s, level, body.flag);
        if (!ok) return send(res, 200, { correct: false }, headers);
        return send(res, 200, { correct: true, systemPrompt: level.systemPrompt.replace("{SECRET}", "<secret>"), lesson: level.lesson, mitigation: level.mitigation }, headers);
      }
      if (path === "/api/hint" && req.method === "GET") {
        const { s, headers } = session(req, res);
        const level = game.level(Number(url.searchParams.get("level")));
        const n = Number(url.searchParams.get("n"));
        if (!level || !Number.isInteger(n) || n < 1 || n > 3) return send(res, 400, { error: "level 1-6 and n 1-3 required" }, headers);
        s.hintsUsed[level.id - 1] = Math.max(s.hintsUsed[level.id - 1]!, n);
        return send(res, 200, { hint: level.hints[n - 1] }, headers);
      }
      if (path === "/api/redteam" && req.method === "GET") return send(res, 200, runRedTeam());

      if (req.method === "GET") {
        const rel = path === "/" ? "index.html" : normalize(path).replace(/^([/\\])+/, "");
        const file = resolve(join(PUBLIC, rel));
        if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) return send(res, 403, { error: "forbidden" });
        const type = TYPES[extname(file)];
        if (!type) return send(res, 404, { error: "not found" });
        try {
          const data = await readFile(file);
          res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
          return void res.end(data);
        } catch { return send(res, 404, { error: "not found" }); }
      }
      send(res, 405, { error: "method not allowed" });
    } catch {
      send(res, 500, { error: "internal error" });
    }
  });
}

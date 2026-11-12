# Prompt Injection Arena

A playable CTF for **prompt injection** (OWASP LLM01). Attack a simulated LLM that guards a secret through **6 levels of escalating defenses**, learn why each defense fails, then open the **red team lab** to see an automated attack corpus run against every level.

> Built with AI assistance (Claude) as part of a security portfolio. The "LLM" here is a deterministic, rule-based simulator: it makes the game free, offline and repeatable, and it does not claim to reproduce the behaviour of any real model.

![Playing level 3](docs/play.png)

![Red team lab](docs/redteam.png)

## Play

```bash
npm install
npm start                 # http://127.0.0.1:8787
npm run redteam           # the attack matrix in your terminal
```

Each browser session gets fresh random secrets for every level, so there is nothing to look up in the source: you extract the flag from the model, paste it in, and unlock the lesson and mitigation for that level.

## The levels

| # | Defense | Lesson |
|---|---|---|
| 1 | None | A secret in the prompt is not a secret |
| 2 | Keyword blocklist on input | Filters check spelling, not meaning |
| 3 | Refusals plus literal output redaction | Output string matching loses to any transformation |
| 4 | Input filter (overrides, encodings) plus output filter (literal, reversed) | Every filter leaves a representation you did not list |
| 5 | Summarizer reading an attacker-controlled document | Indirect injection: data and instructions are indistinguishable |
| 6 | Strict input and output layers | Per-message filters cannot see accumulation across turns |

Each level has three progressive hints. Solving a level reveals what happened, how to defend against it, and the system prompt that was used.

## Red team lab

`GET /api/redteam` (and the second tab) runs a corpus of 13 attacks (direct ask, override, synonym, roleplay, translation, base64, reversal, spelling, ROT13, NATO alphabet, acrostic, chunked extraction, poisoned document) against all six levels with fresh secrets, and classifies each outcome:

- **LEAK**: the full secret came out, in any supported representation (literal, reversed, base64, ROT13, phonetic, acrostic).
- **partial**: a fragment of the secret came out.
- **blocked**: the input filter stopped the attack.
- **refused**: the model declined.

The leak rate falls as defenses stack up (85%, 69%, 46%, 15%, 23%, 0%), but level 6 still falls to chunked extraction across several turns. That is the point: layered filters raise the cost, only **removing the secret from the model's context** removes the risk.

## Design notes

- Zero runtime dependencies: Node `http`, `crypto`, strict TypeScript.
- Secrets come from `crypto.randomInt`, are never sent to the client except through the simulated model's own leaks, and flags are compared in constant time. A flag from one session or level does not work in another.
- Server hardening: `HttpOnly` and `SameSite=Strict` cookies, strict CSP, body size cap (8 KB), message and document length limits, 60 requests per minute per session, bounded session store, path traversal protection on static files.
- The UI renders everything with `textContent`.

## Tests

`npm test` runs 17 tests covering intent detection, every level's intended weakness and its intended defense, the full red-team matrix shape, a guarantee that every level is solvable, fragment reassembly at level 6, session isolation, input validation, size limits, static file safety, and a check that no flag is hard coded in the shipped client. CI runs on Node 20 and 22.

## Ideas to extend

Add a level that uses a real model behind an API key, or new payloads to the corpus (`src/redteam.ts`) to see which levels they break.

MIT licensed.

"use strict";
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
let levels = [], cur = 1;
const histories = {};

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function renderLevels() {
  const box = $("levels"); box.replaceChildren();
  for (const l of levels) {
    const row = el("div", "lv" + (l.id === cur ? " on" : "") + (l.solved ? " solved" : ""));
    const info = el("div"); info.append(el("div", "t", l.title), el("div", "s", l.solved ? "solved" : `${l.attempts} attempts`));
    row.append(el("span", "num", l.solved ? "✓" : String(l.id)), info);
    row.addEventListener("click", () => select(l.id));
    box.append(row);
  }
}

function select(id) {
  cur = id;
  const l = levels.find((x) => x.id === id);
  $("l-title").textContent = `Level ${l.id}: ${l.title}`;
  $("l-scenario").textContent = l.scenario;
  $("l-objective").textContent = "Objective: " + l.objective;
  const b = $("l-badges"); b.replaceChildren();
  for (const [name, on] of [["Input filter", l.defenses.input], ["Output filter", l.defenses.output], ["Refuses plain asks", l.defenses.refuses], ["Reads documents", l.docMode]]) b.append(el("span", "badge" + (on ? " on" : ""), name + (on ? " on" : " off")));
  $("docwrap").classList.toggle("hidden", !l.docMode);
  $("hints").replaceChildren(); $("lesson").classList.add("hidden"); $("flagres").textContent = ""; $("flagres").className = "flagres";
  drawLog(); renderLevels();
}

function bubble(kind, text) { $("log").append(el("div", "msg " + kind, text)); $("log").scrollTop = 1e9; }
function drawLog() {
  $("log").replaceChildren();
  const h = histories[cur] || [];
  if (!h.length) bubble("bot", "I'm the assistant for this level. Try to make me leak the secret.");
  for (const [k, t] of h) bubble(k, t);
}
function remember(k, t) { (histories[cur] = histories[cur] || []).push([k, t]); bubble(k, t); }

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = $("msg").value.trim(); if (!message) return;
  $("msg").value = "";
  if (!(histories[cur] || []).length) $("log").replaceChildren();
  remember("me", message);
  try {
    const r = await api("/api/chat", { level: cur, message, document: $("doc").value });
    if (r.blockedBy === "input") remember("sys", "Input filter: " + r.reply);
    else remember(r.redacted ? "red" : "bot", r.reply + (r.redacted ? "  (output filter redacted part of this reply)" : ""));
  } catch (err) { remember("sys", err.message); }
  levels = await api("/api/levels"); renderLevels();
});

$("flagform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const flag = $("flag").value.trim(); if (!flag) return;
  const r = await api("/api/submit", { level: cur, flag });
  const res = $("flagres");
  if (!r.correct) { res.textContent = "Not the flag. Keep trying."; res.className = "flagres no"; return; }
  res.textContent = "Correct! Level solved."; res.className = "flagres ok";
  const box = $("lesson"); box.replaceChildren(el("h3", "", "What happened"), el("p", "", r.lesson), el("h3", "", "How to defend"), el("p", "", r.mitigation), el("h3", "", "The system prompt was"), el("code", "", r.systemPrompt));
  box.classList.remove("hidden");
  $("flag").value = "";
  levels = await api("/api/levels"); renderLevels();
});

for (const b of document.querySelectorAll(".hint")) b.addEventListener("click", async () => {
  const r = await api(`/api/hint?level=${cur}&n=${b.dataset.n}`);
  $("hints").append(el("p", "", `Hint ${b.dataset.n}: ${r.hint}`));
});

function tab(which) {
  $("play").classList.toggle("hidden", which !== "play"); $("lab").classList.toggle("hidden", which !== "lab");
  $("tab-play").classList.toggle("on", which === "play"); $("tab-lab").classList.toggle("on", which === "lab");
  if (which === "lab") loadLab();
}
async function loadLab() {
  const m = await api("/api/redteam");
  const t = el("table"), head = el("tr");
  head.append(el("th", "", "Attack"));
  for (const l of m.levels) head.append(el("th", "", `L${l.id} ${l.title}`));
  t.append(el("thead")); t.firstChild.append(head);
  const body = el("tbody");
  for (const r of m.rows) {
    const tr = el("tr"), name = el("td", "", r.name); name.append(el("span", "cat", r.category)); tr.append(name);
    for (const c of r.cells) tr.append(el("td", c, { leak: "LEAK", partial: "partial", blocked: "blocked", refused: "–" }[c]));
    body.append(tr);
  }
  const foot = el("tfoot"), fr = el("tr"); fr.append(el("td", "", "Leak rate"));
  for (const v of m.leakRate) fr.append(el("td", "", v + "%"));
  foot.append(fr); t.append(body, foot);
  $("matrix").replaceChildren(t);
}
$("tab-play").addEventListener("click", () => tab("play"));
$("tab-lab").addEventListener("click", () => tab("lab"));

(async () => { levels = await api("/api/levels"); select(1); })();

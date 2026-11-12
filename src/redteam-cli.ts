import { runRedTeam } from "./redteam.js";

const m = runRedTeam();
const sym = { leak: "LEAK", partial: "part", blocked: "blkd", refused: " -- " } as const;
console.log(`${"payload".padEnd(22)}${m.levels.map((l) => `L${l.id}`.padEnd(6)).join("")}`);
for (const r of m.rows) console.log(`${r.name.padEnd(22)}${r.cells.map((c) => sym[c].padEnd(6)).join("")}`);
console.log(`${"leak rate".padEnd(22)}${m.leakRate.map((v) => `${v}%`.padEnd(6)).join("")}`);

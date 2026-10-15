// pnpm evals — runs the checker evals and exits 1 on any failure.
import { runEvals } from "../lib/evals";

const { passed, total, results } = runEvals();
const w = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(w)}  expected ${r.expected.padEnd(22)} actual ${r.actual}`);
}
console.log(`\n${passed}/${total} checker evals passed`);
process.exit(passed === total ? 0 : 1);

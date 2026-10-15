// JSON-on-disk state. Fixtures are read-only; runtime.json is everything that changes.
import fs from "node:fs";
import path from "node:path";
import type { Decision, Milestone, Payout, Runtime, Verification } from "./types";

const ROOT = process.cwd();
const FIXTURES = path.join(ROOT, "data", "fixtures");
const RUNTIME = path.join(ROOT, "data", "runtime.json");

function readJSON<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export const fixtures = {
  milestones: (): Milestone[] => readJSON(path.join(FIXTURES, "milestones.json")),
};

export function policyText(): string {
  return fs.readFileSync(path.join(ROOT, "policy", "escrow-policy.md"), "utf8");
}

/** Returns the quoted text of one clause, e.g. clauseText("§4"). */
export function clauseText(clause: string): string {
  const md = policyText();
  const re = new RegExp(`## ${clause}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const m = md.match(re);
  return m ? m[1].trim() : "";
}

function freshRuntime(): Runtime {
  return {
    milestones: fixtures.milestones(),
    verifications: [],
    decisions: [],
    payouts: [],
    memoryLog: [],
    seeded: false,
    activity: null,
  };
}

export function setActivity(a: Runtime["activity"]) {
  updateRuntime((rt) => {
    rt.activity = a;
  });
}

export function getRuntime(): Runtime {
  if (!fs.existsSync(RUNTIME)) return freshRuntime();
  return readJSON<Runtime>(RUNTIME);
}

export function saveRuntime(rt: Runtime) {
  fs.mkdirSync(path.dirname(RUNTIME), { recursive: true });
  const tmp = RUNTIME + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(rt, null, 2));
  fs.renameSync(tmp, RUNTIME);
}

/** Read-modify-write helper. Node dev server is single-process, so this is enough. */
export function updateRuntime<T>(fn: (rt: Runtime) => T): T {
  const rt = getRuntime();
  const out = fn(rt);
  saveRuntime(rt);
  return out;
}

export function resetRuntime() {
  if (fs.existsSync(RUNTIME)) fs.unlinkSync(RUNTIME);
}

export function getMilestone(id: string): Milestone | undefined {
  return getRuntime().milestones.find((m) => m.id === id);
}

export function upsertMilestone(m: Milestone) {
  updateRuntime((rt) => {
    const i = rt.milestones.findIndex((x) => x.id === m.id);
    if (i >= 0) rt.milestones[i] = m;
    else rt.milestones.push(m);
  });
}

export function upsertVerification(v: Verification) {
  updateRuntime((rt) => {
    const i = rt.verifications.findIndex((x) => x.id === v.id);
    if (i >= 0) rt.verifications[i] = v;
    else rt.verifications.push(v);
  });
}

export function upsertDecision(d: Decision) {
  updateRuntime((rt) => {
    const i = rt.decisions.findIndex((x) => x.id === d.id);
    if (i >= 0) rt.decisions[i] = d;
    else rt.decisions.push(d);
  });
}

export function addPayout(p: Payout) {
  updateRuntime((rt) => rt.payouts.push(p));
}

export function logMemory(dataset: string, text: string) {
  updateRuntime((rt) => rt.memoryLog.push({ at: new Date().toISOString(), dataset, text }));
}

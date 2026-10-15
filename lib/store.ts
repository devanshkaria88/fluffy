// JSON-on-disk state. Fixtures are read-only; runtime.json is everything that changes.
import fs from "node:fs";
import path from "node:path";
import type { Decision, HistoryItem, Invoice, Runtime, Supplier, VerifiedBankChange } from "./types";

const ROOT = process.cwd();
const FIXTURES = path.join(ROOT, "data", "fixtures");
const RUNTIME = path.join(ROOT, "data", "runtime.json");

function readJSON<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export const fixtures = {
  suppliers: (): Supplier[] => readJSON(path.join(FIXTURES, "suppliers.json")),
  inbox: (): Invoice[] => readJSON(path.join(FIXTURES, "inbox.json")),
  history: (): HistoryItem[] => readJSON(path.join(FIXTURES, "history.json")),
};

export function policyText(): string {
  return fs.readFileSync(path.join(ROOT, "policy", "ap-policy.md"), "utf8");
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
    decisions: [],
    history: fixtures.history(),
    verifiedBankChanges: [],
    memoryLog: [],
    seeded: false,
    suppliers: fixtures.suppliers(),
    inboxExtra: [],
  };
}

/** Fixture inbox plus anything dropped in live. */
export function allInbox(rt: Runtime): Invoice[] {
  return [...fixtures.inbox(), ...(rt.inboxExtra ?? [])];
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

export function upsertDecision(d: Decision) {
  updateRuntime((rt) => {
    const i = rt.decisions.findIndex((x) => x.id === d.id);
    if (i >= 0) rt.decisions[i] = d;
    else rt.decisions.push(d);
  });
}

export function addHistory(h: HistoryItem) {
  updateRuntime((rt) => rt.history.push(h));
}

export function addVerifiedBankChange(v: VerifiedBankChange) {
  updateRuntime((rt) => rt.verifiedBankChanges.push(v));
}

export function logMemory(dataset: string, text: string) {
  updateRuntime((rt) => rt.memoryLog.push({ at: new Date().toISOString(), dataset, text }));
}

export function findSupplierByName(suppliers: Supplier[], name: string): Supplier | null {
  const norm = (s: string) => s.toLowerCase().replace(/\b(ltd|limited|plc|llp)\b/g, "").replace(/[^a-z0-9]/g, "");
  const n = norm(name);
  if (!n) return null;
  return suppliers.find((s) => norm(s.name) === n || norm(s.name).includes(n) || n.includes(norm(s.name))) ?? null;
}

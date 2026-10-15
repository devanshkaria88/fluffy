import type { Decision, Milestone, PullRequestRef, Runtime, Verification } from "@/lib/types";

/** GET /api/state */
export interface AppState {
  runtime: Runtime;
  prs: Record<string, PullRequestRef[]>;
  balancePence: number | null;
  agent: { name: string; model: string; executorKeyScope: string };
  policyVersion: string;
  cogneeEnabled: boolean;
}

export const EMPTY_STATE: AppState = {
  runtime: { milestones: [], verifications: [], decisions: [], payouts: [], memoryLog: [], seeded: false, activity: null },
  prs: {},
  balancePence: null,
  agent: { name: "Fluffy", model: "claude-haiku-5-5", executorKeyScope: "—" },
  policyVersion: "—",
  cogneeEnabled: false,
};

export function latestDecision(rt: Runtime, milestoneId: string, prNumber?: number): Decision | undefined {
  return rt.decisions
    .filter((d) => d.milestoneId === milestoneId && (prNumber === undefined || d.prNumber === prNumber))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

export function latestVerification(rt: Runtime, milestoneId: string, prNumber: number): Verification | undefined {
  return rt.verifications
    .filter((v) => v.milestoneId === milestoneId && v.pr.number === prNumber)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
}

export function verificationFor(rt: Runtime, d: Decision | undefined): Verification | undefined {
  return d ? rt.verifications.find((v) => v.id === d.verificationId) : undefined;
}

/** Is Fluffy mid-run on this PR right now? */
export function isRunning(rt: Runtime, milestoneId: string, prNumber: number): boolean {
  const a = rt.activity;
  return !!a && a.milestoneId === milestoneId && a.prNumber === prNumber && a.stage !== "done" && a.stage !== "error";
}

export function milestoneById(rt: Runtime, id: string | null): Milestone | undefined {
  return rt.milestones.find((m) => m.id === id);
}

export async function post<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`);
  return data as T;
}

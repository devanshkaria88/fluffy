import { NextResponse } from "next/server";
import { listPRs } from "@/lib/github";
import { availableBalancePence, executorKeyScope } from "@/lib/executor";
import { cogneeEnabled } from "@/lib/cognee";
import { getRuntime } from "@/lib/store";
import { walletSnapshot } from "@/lib/wallet";
import { AGENT_NAME, POLICY_VERSION, VERIFIER_MODEL, type PullRequestRef } from "@/lib/types";


const TTL = 15_000;
const prCache = new Map<string, { at: number; prs: PullRequestRef[] }>();
let balanceCache: { at: number; value: number | null } = { at: 0, value: null };

export async function GET() {
  const runtime = getRuntime();
  const prs: Record<string, PullRequestRef[]> = {};
  const [wallet] = await Promise.all([
    walletSnapshot(runtime.milestones).catch(() => null),
    ...runtime.milestones.map(async (m) => {
      const c = prCache.get(m.id);
      if (c && Date.now() - c.at < TTL) return void (prs[m.id] = c.prs);
      try {
        const list = await listPRs(m.repo);
        prCache.set(m.id, { at: Date.now(), prs: list });
        prs[m.id] = list;
      } catch {
        prs[m.id] = c?.prs ?? [];
      }
    }),
  ]);
  if (Date.now() - balanceCache.at > 10_000) {
    try {
      balanceCache = { at: Date.now(), value: await availableBalancePence() };
    } catch {
      balanceCache = { at: Date.now(), value: null };
    }
  }
  return NextResponse.json({
    runtime,
    prs,
    balancePence: balanceCache.value,
    wallet,
    agent: { name: AGENT_NAME, model: VERIFIER_MODEL, executorKeyScope: executorKeyScope() },
    policyVersion: POLICY_VERSION,
    cogneeEnabled,
  });
}

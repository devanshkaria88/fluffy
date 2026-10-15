// Project memory: local facts from the runtime store, plus Cognee graph recall when configured.
import { add, cogneeEnabled, remember, search } from "./cognee";
import { getRuntime, logMemory } from "./store";
import type { MemoryFact, Milestone, PullRequestRef } from "./types";
import { formatGBP } from "./types";

const DATASET = "settle_project";
const MAX_COGNEE_FACTS = 8;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

/** Milestone doc, one doc per requirement, one per policy clause, and the client's acceptance notes. */
export async function seedProjectMemory(milestone: Milestone, policyMd: string): Promise<{ ok: boolean; detail: string }> {
  const docs = [
    milestone.docMarkdown,
    ...milestone.requirements.map(
      (r) => `Milestone ${milestone.id} requirement ${r.id}: ${r.text}${r.testable ? " This requirement must be proven by a passing test." : ""}`,
    ),
    ...policyMd
      .split(/^(?=## §)/m)
      .filter((s) => s.startsWith("## §"))
      .map((s) => `Settle escrow policy clause. ${s.trim()}`),
    `Client acceptance notes for ${milestone.clientName}: Greentask expects each requirement covered by a test named for it (e.g. 'R4 ...'). In a previous milestone Greentask held payment because pagination was implemented without a test. Greentask accepts half-up rounding for VAT.`,
  ];
  for (const d of docs) logMemory(DATASET, d);
  if (!cogneeEnabled) {
    return { ok: false, detail: `Cognee not configured (COGNEE_API_KEY unset); ${docs.length} docs logged locally only` };
  }
  try {
    await withTimeout(remember(DATASET, docs), 90_000, "cognee remember");
    return { ok: true, detail: `${docs.length} docs added and cognified in Cognee dataset "${DATASET}"` };
  } catch (e) {
    return { ok: false, detail: `${docs.length} docs logged locally; Cognee remember failed: ${msg(e)}` };
  }
}

/** Flatten whatever Cognee returns (strings, or objects with text/content/answer/search_result fields) into lines. */
function flatten(x: unknown, out: string[] = []): string[] {
  if (out.length >= MAX_COGNEE_FACTS) return out;
  if (typeof x === "string") {
    const t = x.trim();
    if (t) out.push(t);
  } else if (Array.isArray(x)) {
    for (const v of x) flatten(v, out);
  } else if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const inner = o.text ?? o.content ?? o.answer ?? o.search_result ?? o.results ?? o.result;
    if (inner !== undefined) flatten(inner, out);
  }
  return out;
}

/** Always returns local facts; adds Cognee graph facts when configured. Never throws. */
export async function recallContext(milestone: Milestone, pr: PullRequestRef): Promise<MemoryFact[]> {
  const facts: MemoryFact[] = [];
  const local = (text: string) => facts.push({ text, source: "local" });

  const escrow = milestone.escrow ? `${milestone.escrow.status} (${milestone.escrow.paymentIntentId})` : "not funded";
  local(
    `Milestone ${milestone.id} "${milestone.title}" for ${milestone.clientName}: ${formatGBP(milestone.amountPence)} to ${milestone.freelancerName} (@${milestone.freelancerLogin}); escrow ${escrow}.`,
  );
  local(
    `This PR: #${pr.number} "${pr.title}" by @${pr.authorLogin} (${pr.headSha.slice(0, 7)} on ${pr.headRef} → ${pr.baseRef}, ${pr.changedFiles} files changed)${pr.authorLogin === milestone.freelancerLogin ? "" : " — author is NOT the contracted freelancer"}.`,
  );
  try {
    const decisions = getRuntime().decisions.filter((d) => d.milestoneId === milestone.id);
    if (!decisions.length) local(`No prior decisions for ${milestone.id}; this is the first verification.`);
    for (const d of decisions) {
      local(`Prior decision ${d.id} on PR #${d.prNumber} (${d.headSha.slice(0, 7)}): ${d.verdict} — ${d.reason} [status: ${d.status}]`);
      if (d.human) local(`Human note by ${d.human.by} (${d.human.action}): ${d.human.note}`);
    }
  } catch {
    /* local facts are best-effort */
  }

  if (!cogneeEnabled) return facts;
  try {
    const query =
      `What does client ${milestone.clientName} expect for milestone ${milestone.title}, and what happened on previous verifications? ` +
      `Requirements: ${milestone.requirements.map((r) => `${r.id} ${r.text}`).join("; ")}`;
    const raw = await withTimeout(
      search(query, { datasets: [DATASET], search_type: "GRAPH_COMPLETION", top_k: MAX_COGNEE_FACTS }),
      12_000,
      "cognee search",
    );
    for (const line of flatten(raw).slice(0, MAX_COGNEE_FACTS)) facts.push({ text: line.slice(0, 400), source: "cognee" });
  } catch {
    /* on error return the local facts only */
  }
  return facts;
}

/** Log the outcome locally and, when enabled, add it to Cognee (fire-and-forget). */
export async function rememberOutcome(text: string): Promise<void> {
  logMemory(DATASET, text);
  if (cogneeEnabled) void add(DATASET, [text]).catch(() => {});
}

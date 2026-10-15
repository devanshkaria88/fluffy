// Orchestration: tests → two verifiers → cross-check → policy checker → Stripe → GitHub → memory.
import { createHash } from "node:crypto";
import { countBaseTests, getDiff, getPR, postComment, prepareWorkdir, runTests } from "./github";
import { verifyPR } from "./verify";
import { recallContext, rememberOutcome, seedProjectMemory } from "./memory";
import { check } from "./checker";
import { availableBalancePence, ensureFreelancerAccount, fundEscrow, release } from "./executor";
import { addPayout, getRuntime, policyText, setActivity, updateRuntime, upsertDecision, upsertMilestone, upsertVerification } from "./store";
import {
  AGENT_NAME,
  POLICY_VERSION,
  formatGBP,
  type ActivityStage,
  type Decision,
  type Milestone,
  type PullRequestRef,
  type Verification,
} from "./types";

const now = () => new Date().toISOString();
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const sha7 = (s: string) => s.slice(0, 7);
export const ids = (milestoneId: string, headSha: string) => {
  const h = hash(`${milestoneId}|${headSha}|${POLICY_VERSION}`);
  return { verificationId: "ver_" + h, decisionId: "dec_" + h };
};

function findMilestone(id: string): Milestone {
  const m = getRuntime().milestones.find((x) => x.id === id);
  if (!m) throw new Error(`unknown milestone ${id}`);
  return m;
}

export async function seed(): Promise<Milestone[]> {
  const out: Milestone[] = [];
  for (const m of getRuntime().milestones) {
    if (!m.escrow) m.escrow = await fundEscrow(m);
    if (!m.freelancerConnectedAccountId) {
      // Connect may not be enabled on the platform account; the executor then falls back to a payout.
      m.freelancerConnectedAccountId = await ensureFreelancerAccount(m).catch(() => null);
    }
    upsertMilestone(m);
    // Cognee's graph build can take a minute; don't hold the Seed button on it. Progress lands in runtime.memoryLog.
    void seedProjectMemory(m, policyText()).catch(() => ({ ok: false, detail: "memory seed failed" }));
    out.push(m);
  }
  updateRuntime((rt) => {
    rt.seeded = true;
  });
  return out;
}

export async function verifyAndDecide(milestoneId: string, prNumber: number): Promise<{ verification: Verification; decision: Decision }> {
  const milestone = findMilestone(milestoneId);
  const timeline: Decision["timeline"] = [];
  const stage = (s: ActivityStage, detail: string) => {
    timeline.push({ at: now(), event: `${s}: ${detail}` });
    setActivity({ milestoneId, prNumber, stage: s, detail, at: now() });
  };
  try {
    stage("fetching", `PR #${prNumber} from ${milestone.repo}`);
    const startedAt = now();
    const pr = await getPR(milestone.repo, prNumber);
    const dir = await prepareWorkdir(milestone.repo, pr.headSha, milestone.baseBranch);

    stage("testing", `running the suite on ${sha7(pr.headSha)}`);
    const baseTotal = await countBaseTests(dir, milestone.baseBranch);
    const testRun = await runTests(dir);
    testRun.baseTotal = baseTotal;
    const diff = await getDiff(dir, milestone.baseBranch, pr.headSha);
    timeline.push({ at: now(), event: `tests: ${testRun.passed}/${testRun.total} passed, ${testRun.failed} failed; base had ${baseTotal ?? "n/a"}` });

    stage("recalling", `asking memory about ${milestone.repo}`);
    const memory = await recallContext(milestone, pr).catch(() => []);

    stage("verifying", `two verifiers assessing ${milestone.requirements.length} requirements`);
    const { reports, crossChecked, agreed, disagreements } = await verifyPR({ milestone, pr, testRun, diff, memory });
    const { verificationId, decisionId } = ids(milestoneId, pr.headSha);
    const verification: Verification = {
      id: verificationId,
      milestoneId,
      pr,
      startedAt,
      finishedAt: now(),
      testRun,
      reports,
      crossChecked,
      agreed,
      disagreements,
      requirementsMet: crossChecked.filter((c) => c.met).length,
      requirementsTotal: milestone.requirements.length,
      memoryUsed: memory,
      diffChars: diff.length,
    };
    upsertVerification(verification);
    timeline.push({ at: now(), event: `verifiers: ${verification.requirementsMet}/${verification.requirementsTotal} met, ${agreed ? "agree" : "disagree on " + disagreements.join(", ")}` });

    stage("checking", "policy §1–§7 against the evidence");
    const balance = await availableBalancePence().catch(() => 0);
    const result = check({
      milestone,
      pr,
      verification,
      payouts: getRuntime().payouts,
      availableBalancePence: balance,
      policyVersion: POLICY_VERSION,
      now: now(),
    });
    const decision: Decision = {
      id: decisionId,
      milestoneId,
      verificationId,
      prNumber,
      headSha: pr.headSha,
      createdAt: now(),
      verdict: result.verdict,
      checks: result.checks,
      citedClauses: result.citedClauses,
      reason: result.reason,
      policyVersion: POLICY_VERSION,
      status: "held",
      timeline,
    };
    timeline.push({ at: now(), event: `checker: ${result.verdict} (${result.citedClauses.join(", ")}) — audit row written before any Stripe call` });
    upsertDecision(decision);

    if (result.verdict === "PAY") {
      stage("paying", `releasing ${formatGBP(milestone.amountPence)} with idempotency key ${decisionId}`);
      try {
        const out = await release(decision, milestone);
        decision.stripe = out;
        decision.status = "paid";
        addPayout({ milestoneId, decisionId, prNumber, amountPence: out.amountPence, stripeId: out.id, paidAt: out.createdAt });
        if (milestone.escrow) milestone.escrow.status = "released";
        upsertMilestone(milestone);
        timeline.push({ at: now(), event: `stripe: transfer ${out.id} for ${formatGBP(out.amountPence)}${out.sourceTransaction ? " from " + out.sourceTransaction : ""}` });
      } catch (e) {
        decision.status = "failed";
        decision.error = (e as Error).message;
        timeline.push({ at: now(), event: `stripe: release failed — ${decision.error}` });
      }
      upsertDecision(decision);
    }

    stage("commenting", `posting the report on PR #${prNumber}`);
    try {
      decision.githubCommentUrl = await postComment(milestone.repo, prNumber, report(milestone, pr, verification, decision));
      timeline.push({ at: now(), event: `github: comment ${decision.githubCommentUrl}` });
    } catch (e) {
      timeline.push({ at: now(), event: `github: comment failed — ${(e as Error).message}` });
    }
    upsertDecision(decision);

    const unmet = crossChecked.filter((c) => !c.met);
    await rememberOutcome(
      `Milestone ${milestone.id} (${milestone.title}), PR #${prNumber} at ${sha7(pr.headSha)} by @${pr.authorLogin}: verdict ${decision.verdict}, status ${decision.status}. ` +
        `${verification.requirementsMet}/${verification.requirementsTotal} requirements met` +
        (unmet.length ? `; not met: ${unmet.map((c) => `${c.id} (${c.note})`).join(", ")}` : "") +
        (agreed ? "" : `; verifiers disagreed on ${disagreements.join(", ")}`) +
        `. Policy clauses ${decision.citedClauses.join(", ")}.` +
        (decision.stripe ? ` Transfer ${decision.stripe.id} for ${formatGBP(decision.stripe.amountPence)}.` : ""),
    ).catch(() => undefined);

    stage("done", decision.status === "paid" ? `released ${formatGBP(milestone.amountPence)} → ${decision.stripe?.id}` : `${decision.verdict} under ${decision.citedClauses.join(", ")}`);
    upsertDecision(decision);
    return { verification, decision };
  } catch (e) {
    setActivity({ milestoneId, prNumber, stage: "error", detail: (e as Error).message, at: now() });
    throw e;
  }
}

export async function humanDecision(decisionId: string, action: "release" | "uphold_hold", by: string, note: string): Promise<Decision> {
  const rt = getRuntime();
  const decision = rt.decisions.find((d) => d.id === decisionId);
  if (!decision) throw new Error(`unknown decision ${decisionId}`);
  const milestone = findMilestone(decision.milestoneId);
  decision.human = { action, by, at: now(), note };
  decision.timeline.push({ at: now(), event: `human: ${by} chose ${action} — ${note}` });
  upsertDecision(decision);
  if (action === "release") {
    try {
      const out = await release(decision, milestone);
      decision.stripe = out;
      decision.status = "released_by_human";
      addPayout({ milestoneId: milestone.id, decisionId, prNumber: decision.prNumber, amountPence: out.amountPence, stripeId: out.id, paidAt: out.createdAt });
      if (milestone.escrow) milestone.escrow.status = "released";
      upsertMilestone(milestone);
      decision.timeline.push({ at: now(), event: `stripe: transfer ${out.id} released by ${by}` });
    } catch (e) {
      decision.status = "failed";
      decision.error = (e as Error).message;
      decision.timeline.push({ at: now(), event: `stripe: release failed — ${decision.error}` });
    }
  } else {
    decision.status = "held";
  }
  upsertDecision(decision);
  await rememberOutcome(`Reviewer ${by} ${action} on ${decisionId} (${milestone.id}, PR #${decision.prNumber}): ${note}`).catch(() => undefined);
  return decision;
}

export async function replay(decisionId: string): Promise<{ sameStripeId: boolean; stripeId: string | null }> {
  const rt = getRuntime();
  const decision = rt.decisions.find((d) => d.id === decisionId);
  if (!decision) throw new Error(`unknown decision ${decisionId}`);
  const milestone = findMilestone(decision.milestoneId);
  const out = await release(decision, milestone);
  const same = out.id === decision.stripe?.id;
  decision.timeline.push({ at: now(), event: `replay: Stripe returned ${out.id} (${same ? "same transfer, no second payment" : "DIFFERENT transfer"})` });
  upsertDecision(decision);
  return { sameStripeId: same, stripeId: out.id };
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

function report(m: Milestone, pr: PullRequestRef, v: Verification, d: Decision): string {
  const t = v.testRun;
  const L: string[] = [
    `## 🧸 ${AGENT_NAME} verified PR #${pr.number} against ${m.title}`,
    "",
    `**Verdict: ${d.verdict}** — ${d.reason}`,
    "",
    "### Requirements",
    "| Req | Met | Evidence | Note |",
    "|---|---|---|---|",
    ...v.crossChecked.map(
      (c) => `| ${c.id} | ${c.met ? "✅" : "❌"} | ${c.evidence.map((e) => `\`${cell(e.ref)}\``).join(", ") || "—"} | ${cell(c.note)} |`,
    ),
    "",
    "### Policy checks",
    "| Clause | Check | Result | Evidence |",
    "|---|---|---|---|",
    ...d.checks.map((c) => `| ${c.clause} | ${cell(c.title)} | ${c.passed ? "✅" : "❌"} | ${cell(c.evidence)} |`),
    "",
    "### Tests",
    `${t.passed}/${t.total} passed, ${t.failed} failed, ${t.skipped} skipped on \`${sha7(pr.headSha)}\` (base had ${t.baseTotal ?? "n/a"}) — \`${t.command}\``,
    "",
    "### Verifiers",
    ...v.reports.map((r) => `- **Verifier ${r.verifier}** (${r.framing}, ${r.model}): ${r.summary}`),
    v.agreed ? "- Verifiers agree on every requirement." : `- Verifiers disagree on ${v.disagreements.join(", ")}.`,
    "",
  ];
  if (d.stripe) L.push(`**Released ${formatGBP(d.stripe.amountPence)} → ${d.stripe.id}** (${d.stripe.dashboardUrl})`);
  else if (d.status === "failed") L.push(`**Release failed** — ${d.error}`);
  else L.push(`**HELD under ${d.citedClauses.join(", ")}** — ${d.reason}`);
  L.push("", `<sub>Decision \`${d.id}\` · Verification \`${v.id}\` · Policy ${POLICY_VERSION} · Agent ${AGENT_NAME}</sub>`);
  return L.join("\n");
}

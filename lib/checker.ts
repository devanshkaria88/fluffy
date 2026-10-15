// Deterministic policy checker. Pure: no I/O, no clock, imports only ./types.
// Evaluates every clause §1–§7 and returns the full table so a judge can read it.
import { AUTO_RELEASE_LIMIT_PENCE, formatGBP, type Check, type CheckerInput, type CheckerResult } from "./types";

const sha7 = (s: string) => s.slice(0, 7);

export function check(input: CheckerInput): CheckerResult {
  const { milestone: m, pr, verification: v, payouts, availableBalancePence } = input;
  const amount = formatGBP(m.amountPence);
  const checks: Check[] = [];

  // §1 escrow funded
  const esc = m.escrow;
  const fundedEnough = !!esc && (esc.status === "funded" || esc.status === "released") && esc.amountPence >= m.amountPence;
  checks.push({
    clause: "§1",
    title: "Escrow funded",
    passed: fundedEnough,
    evidence: esc
      ? `PaymentIntent ${esc.paymentIntentId} ${esc.status} for ${formatGBP(esc.amountPence)} (milestone ${amount})`
      : `no escrow funded for ${m.id}`,
  });

  // §2 right work, right person
  const authorOk = pr.authorLogin.toLowerCase() === m.freelancerLogin.toLowerCase();
  const baseOk = pr.baseRef === m.baseBranch;
  checks.push({
    clause: "§2",
    title: "Right work from the right person",
    passed: authorOk && baseOk,
    evidence: `author @${pr.authorLogin} ${authorOk ? "=" : "≠"} @${m.freelancerLogin}; base ${pr.baseRef} ${baseOk ? "=" : "≠"} ${m.baseBranch}`,
  });

  // §3 suite green and not shrinking
  const t = v.testRun;
  const green = t.ok && t.failed === 0 && t.total > 0;
  const notShrunk = t.baseTotal == null || t.total >= t.baseTotal;
  checks.push({
    clause: "§3",
    title: "Suite green and not shrinking",
    passed: green && notShrunk,
    evidence: `${t.passed}/${t.total} passed, ${t.failed} failed on ${sha7(pr.headSha)}; base had ${t.baseTotal ?? "n/a"}${
      !notShrunk ? " (suite shrank)" : ""
    }`,
  });

  // §4 every requirement, two verifiers, real evidence
  const byId = new Map(v.crossChecked.map((c) => [c.id, c]));
  const unmet = m.requirements.filter((r) => !byId.get(r.id)?.met);
  const metCount = m.requirements.length - unmet.length;
  const parts: string[] = [];
  if (unmet.length) parts.push(unmet.map((r) => `${r.id} not met: ${byId.get(r.id)?.note ?? "no verdict"}`).join("; "));
  if (!v.agreed) parts.push(`verifiers disagree on ${v.disagreements.join(", ") || "some requirements"}`);
  checks.push({
    clause: "§4",
    title: "Every requirement verified by two verifiers with evidence",
    passed: v.agreed && unmet.length === 0,
    evidence: parts.length ? parts.join("; ") : `${metCount}/${m.requirements.length} met, verifiers agree`,
  });

  // §5 amount and limits
  const withinLimit = m.amountPence <= AUTO_RELEASE_LIMIT_PENCE;
  checks.push({
    clause: "§5",
    title: "Amount within auto-release limit",
    passed: withinLimit,
    evidence: withinLimit
      ? `${amount} ≤ ${formatGBP(AUTO_RELEASE_LIMIT_PENCE)} auto-release limit`
      : `${amount} exceeds ${formatGBP(AUTO_RELEASE_LIMIT_PENCE)}; client co-sign required`,
  });

  // §6 one payment per milestone (decision id shares the hash with the verification id)
  const ownDecisionId = "dec_" + v.id.replace(/^ver_/, "");
  const prior = payouts.filter((p) => p.milestoneId === m.id);
  const foreign = prior.find((p) => p.decisionId !== ownDecisionId);
  const replay = prior.find((p) => p.decisionId === ownDecisionId);
  const releasedElsewhere = esc?.status === "released" && !replay;
  const oncePassed = !foreign && !releasedElsewhere;
  checks.push({
    clause: "§6",
    title: "One payment per milestone",
    passed: oncePassed,
    evidence: foreign
      ? `already paid by ${foreign.stripeId} (decision ${foreign.decisionId}, PR #${foreign.prNumber})`
      : releasedElsewhere
        ? `escrow ${esc?.paymentIntentId} already marked released`
        : replay
          ? `replay of ${replay.stripeId}; idempotency key ${ownDecisionId}`
          : `no prior payout for ${m.id}; idempotency key ${ownDecisionId}`,
  });

  // §7 guardrails
  const cashOk = availableBalancePence >= m.amountPence;
  checks.push({
    clause: "§7",
    title: "Guardrails: available balance covers release",
    passed: cashOk,
    evidence: `available balance ${formatGBP(availableBalancePence)} ${cashOk ? "≥" : "<"} ${amount}`,
  });

  const failing = checks.filter((c) => !c.passed);
  const verdict = failing.length === 0 ? "PAY" : "HOLD";
  const citedClauses = (failing.length ? failing : checks).map((c) => c.clause);
  const reason =
    verdict === "PAY"
      ? `All seven policy checks pass: ${metCount}/${m.requirements.length} requirements met, suite green, escrow funded; releasing ${amount}.`
      : `Held under ${citedClauses.join(", ")}: ${failing.map((c) => c.evidence).join("; ")}.`;

  return { verdict, checks, citedClauses, reason };
}

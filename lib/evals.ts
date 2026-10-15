// Checker evals: a baseline PAY input, mutated one clause at a time. Pure, no Stripe, no network.
import { check } from "./checker";
import { AUTO_RELEASE_LIMIT_PENCE, POLICY_VERSION, type CheckerInput, type Milestone, type PullRequestRef, type RequirementVerdict, type TestRun, type Verdict, type Verification } from "./types";

export interface EvalResult {
  name: string;
  expected: string;
  actual: string;
  ok: boolean;
  citedClauses: string[];
}

const NOW = "2026-10-15T19:00:00.000Z";
const HEAD = "3f2a1c9d8e7b6a5f4c3d2e1f0a9b8c7d6e5f4a3b";

export function baseline(): CheckerInput {
  const reqs = ["R1", "R2", "R3", "R4", "R5"];
  const milestone: Milestone = {
    id: "ms_m1",
    title: "M1 — Invoice module",
    clientName: "Greentask Ltd",
    repo: "devanshkaria88/settle-demo-invoicing",
    baseBranch: "main",
    freelancerLogin: "devanshkaria88",
    freelancerName: "Devansh Karia",
    freelancerConnectedAccountId: "acct_test",
    amountPence: 120000,
    currency: "GBP",
    requirements: reqs.map((id) => ({ id, text: `${id} requirement`, testable: true })),
    docMarkdown: "",
    escrow: { paymentIntentId: "pi_test_funded", chargeId: "ch_test", amountPence: 120000, fundedAt: NOW, status: "funded" },
  };
  const pr: PullRequestRef = {
    number: 7,
    url: "https://github.com/devanshkaria88/settle-demo-invoicing/pull/7",
    title: "M1 invoices",
    body: "",
    authorLogin: "devanshkaria88",
    headSha: HEAD,
    headRef: "feat/m1",
    baseRef: "main",
    state: "open",
    changedFiles: 4,
    additions: 200,
    deletions: 3,
  };
  const tests = reqs.map((id) => ({ name: `${id} passes`, file: "test/invoice.test.ts", status: "passed" as const }));
  const testRun: TestRun = {
    command: "pnpm test",
    ok: true,
    passed: tests.length,
    failed: 0,
    skipped: 0,
    total: tests.length,
    baseTotal: 1,
    durationMs: 900,
    tests,
    stdoutTail: "",
  };
  const verdicts = (): RequirementVerdict[] =>
    reqs.map((id) => ({ id, met: true, evidence: [{ kind: "test", ref: `${id} passes`, detail: "ran and passed" }], note: "met" }));
  const verification: Verification = {
    id: "ver_abc123def456",
    milestoneId: "ms_m1",
    pr,
    startedAt: NOW,
    finishedAt: NOW,
    testRun,
    reports: [
      { verifier: "A", framing: "strict reviewer", model: "claude-haiku-5-5", verdicts: verdicts(), summary: "all met" },
      { verifier: "B", framing: "client advocate", model: "claude-haiku-5-5", verdicts: verdicts(), summary: "all met" },
    ],
    crossChecked: verdicts(),
    agreed: true,
    disagreements: [],
    requirementsMet: 5,
    requirementsTotal: 5,
    memoryUsed: [],
    diffChars: 1200,
  };
  return { milestone, pr, verification, payouts: [], availableBalancePence: 500000, policyVersion: POLICY_VERSION, now: NOW };
}

type Case = { name: string; verdict: Verdict; clauses: string[]; mutate: (i: CheckerInput) => void };

export const cases: Case[] = [
  { name: "all pass", verdict: "PAY", clauses: ["§1", "§2", "§3", "§4", "§5", "§6", "§7"], mutate: () => {} },
  { name: "unfunded escrow", verdict: "HOLD", clauses: ["§1"], mutate: (i) => void (i.milestone.escrow = null) },
  { name: "wrong author", verdict: "HOLD", clauses: ["§2"], mutate: (i) => void (i.pr.authorLogin = "someone-else") },
  {
    name: "failing test",
    verdict: "HOLD",
    clauses: ["§3"],
    mutate: (i) => {
      const t = i.verification.testRun;
      t.ok = false;
      t.failed = 1;
      t.passed = t.total - 1;
      t.tests[0].status = "failed";
    },
  },
  { name: "suite shrank", verdict: "HOLD", clauses: ["§3"], mutate: (i) => void (i.verification.testRun.baseTotal = 9) },
  {
    name: "R4 not met",
    verdict: "HOLD",
    clauses: ["§4"],
    mutate: (i) => {
      const r4 = i.verification.crossChecked.find((c) => c.id === "R4")!;
      r4.met = false;
      r4.note = "no pagination metadata returned";
    },
  },
  {
    name: "verifiers disagree",
    verdict: "HOLD",
    clauses: ["§4"],
    mutate: (i) => {
      i.verification.agreed = false;
      i.verification.disagreements = ["R2"];
    },
  },
  {
    name: "over £5,000",
    verdict: "HOLD",
    clauses: ["§5"],
    mutate: (i) => {
      i.milestone.amountPence = AUTO_RELEASE_LIMIT_PENCE + 100;
      i.milestone.escrow!.amountPence = i.milestone.amountPence;
      i.availableBalancePence = i.milestone.amountPence * 2;
    },
  },
  {
    name: "already paid",
    verdict: "HOLD",
    clauses: ["§6"],
    mutate: (i) => {
      i.payouts.push({ milestoneId: "ms_m1", decisionId: "dec_000000000000", prNumber: 5, amountPence: 120000, stripeId: "tr_prior", paidAt: NOW });
      i.milestone.escrow!.status = "released";
    },
  },
  { name: "low balance", verdict: "HOLD", clauses: ["§7"], mutate: (i) => void (i.availableBalancePence = 5000) },
];

export function runEvals(): { passed: number; total: number; results: EvalResult[] } {
  const results = cases.map((c) => {
    const input = baseline();
    c.mutate(input);
    const r = check(input);
    const expected = `${c.verdict} ${c.clauses.join(",")}`;
    const actual = `${r.verdict} ${r.citedClauses.join(",")}`;
    return { name: c.name, expected, actual, ok: expected === actual, citedClauses: r.citedClauses };
  });
  return { passed: results.filter((r) => r.ok).length, total: results.length, results };
}

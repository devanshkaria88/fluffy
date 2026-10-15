// Shared contracts for Fluffy. Every module imports from here; nothing here imports anything.

export type Verdict = "PAY" | "HOLD";

export interface Requirement {
  id: string; // "R1"
  text: string;
  testable: boolean; // false → may be met by code/doc evidence alone
}

export interface Escrow {
  paymentIntentId: string; // pi_… the client's funding charge (test mode)
  chargeId: string | null; // ch_… used as source_transaction on the release transfer
  amountPence: number;
  fundedAt: string;
  status: "funded" | "released" | "refunded";
}

export interface Milestone {
  id: string; // "ms_m1"
  title: string;
  clientName: string;
  repo: string; // "owner/name"
  baseBranch: string; // "main"
  freelancerLogin: string; // GitHub login that must author the PR
  freelancerName: string;
  freelancerConnectedAccountId: string | null; // acct_… created at seed (Stripe Connect, test)
  amountPence: number;
  currency: "GBP";
  requirements: Requirement[];
  docMarkdown: string; // the milestone doc exactly as the client gave it
  escrow: Escrow | null;
}

export interface PullRequestRef {
  number: number;
  url: string;
  title: string;
  body: string;
  authorLogin: string;
  headSha: string;
  headRef: string;
  baseRef: string;
  state: "open" | "closed" | "merged";
  changedFiles: number;
  additions: number;
  deletions: number;
}

export interface TestCase {
  name: string; // full test name as the runner reports it
  file: string;
  status: "passed" | "failed" | "skipped";
  message?: string;
}

export interface TestRun {
  command: string;
  ok: boolean;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  baseTotal: number | null; // number of tests on the base branch, for §3 "no decrease"
  durationMs: number;
  tests: TestCase[];
  stdoutTail: string;
}

export interface Evidence {
  kind: "test" | "code" | "doc";
  ref: string; // test name, or path:line, or doc section
  detail: string; // one line
}

export interface RequirementVerdict {
  id: string; // requirement id
  met: boolean;
  evidence: Evidence[];
  note: string;
}

export interface VerifierReport {
  verifier: "A" | "B";
  framing: string; // short label of the persona/prompt used
  model: string;
  verdicts: RequirementVerdict[];
  summary: string;
}

export interface MemoryFact {
  text: string;
  source: "cognee" | "local";
}

export interface Verification {
  id: string; // "ver_…"
  milestoneId: string;
  pr: PullRequestRef;
  startedAt: string;
  finishedAt: string;
  testRun: TestRun;
  reports: VerifierReport[]; // two independent reports (§4)
  crossChecked: RequirementVerdict[]; // final per-requirement verdicts after cross-checking cited tests against testRun
  agreed: boolean; // both verifiers agree on every requirement
  disagreements: string[]; // requirement ids where A and B differ
  requirementsMet: number;
  requirementsTotal: number;
  memoryUsed: MemoryFact[];
  diffChars: number;
}

export interface Check {
  clause: string; // "§4"
  title: string;
  passed: boolean;
  evidence: string; // one line a judge can read
}

export interface Payout {
  milestoneId: string;
  decisionId: string;
  prNumber: number;
  amountPence: number;
  stripeId: string;
  paidAt: string;
}

export interface CheckerInput {
  milestone: Milestone;
  pr: PullRequestRef;
  verification: Verification;
  payouts: Payout[]; // all payouts so far (§6)
  availableBalancePence: number;
  policyVersion: string;
  now: string; // ISO, injected for determinism
}

export interface CheckerResult {
  verdict: Verdict;
  checks: Check[];
  citedClauses: string[];
  reason: string; // one sentence
}

export interface StripeOutcome {
  object: "transfer" | "payout";
  id: string;
  amountPence: number;
  createdAt: string;
  dashboardUrl: string;
  sourceTransaction: string | null;
}

export type DecisionStatus = "paid" | "held" | "failed" | "disputed" | "released_by_human";

export interface Decision {
  id: string; // "dec_…" — deterministic from milestone + PR head sha + policy version; also the Stripe idempotency key
  milestoneId: string;
  verificationId: string;
  prNumber: number;
  headSha: string;
  createdAt: string;
  verdict: Verdict;
  checks: Check[];
  citedClauses: string[];
  reason: string;
  policyVersion: string;
  status: DecisionStatus;
  stripe?: StripeOutcome;
  human?: { action: "release" | "uphold_hold"; by: string; at: string; note: string };
  error?: string;
  timeline: { at: string; event: string }[]; // audit trail, appended in order
  githubCommentUrl?: string;
}

export type ActivityStage = "fetching" | "testing" | "recalling" | "verifying" | "checking" | "paying" | "commenting" | "done" | "error";

export interface Activity {
  milestoneId: string;
  prNumber: number;
  stage: ActivityStage;
  detail: string; // one line, e.g. "running 12 tests on 3f2a1c"
  at: string;
}

export interface Runtime {
  milestones: Milestone[];
  verifications: Verification[];
  decisions: Decision[];
  payouts: Payout[];
  memoryLog: { at: string; dataset: string; text: string }[];
  seeded: boolean;
  activity: Activity | null; // what Fluffy is doing right now, for the face and the live log
}

/** The freelancer's side of the ledger: their Connect account balance and every transfer that has landed. */
export interface WalletTransfer {
  id: string; // tr_…
  amountPence: number;
  createdAt: string;
  description: string;
  milestoneId: string | null;
  decisionId: string | null;
  prNumber: number | null;
  dashboardUrl: string;
}

export interface Wallet {
  accountId: string;
  login: string; // GitHub login of the freelancer
  name: string;
  availablePence: number | null;
  pendingPence: number | null;
  transfers: WalletTransfer[]; // newest first
  fetchedAt: string;
}

export const AGENT_NAME = "Fluffy";
export const VERIFIER_MODEL = "claude-haiku-5-5";

export const POLICY_VERSION = "1.0 (2026-10-15)";
export const AUTO_RELEASE_LIMIT_PENCE = 500_000; // §5 £5,000.00
export const CASH_FLOOR_PENCE = 0; // §7 platform never pays below escrowed funds; escrow covers it

export const formatGBP = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

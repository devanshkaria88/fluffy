// Shared contracts for Clearance. Every module imports from here; nothing here imports anything.

export type Verdict = "PAY" | "HOLD" | "REJECT";

export interface BankDetails {
  sortCode: string; // "20-00-00"
  accountNumber: string; // "55779911"
}

export interface Supplier {
  id: string; // "sup_acme"
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  bank: BankDetails;
  bankVerified: { by: string; on: string; method: string }; // who verified the bank details and when
  phone: string; // the number ON FILE — the only number a human may call for verification
  email: string;
  category: string;
  trailingAmountsPence: number[]; // last invoices, most recent first
  connectedAccountId: string | null; // Stripe acct_… created at seed time (null → payout rail)
}

export interface Invoice {
  id: string; // "inv_001"
  receivedAt: string; // ISO
  source: string; // "email:accounts@acme-office.co.uk"
  rawText: string; // the invoice as text, what the extractor reads
}

/** One structured reading of an invoice. Two of these must agree (§5). */
export interface Extraction {
  supplierName: string;
  invoiceNumber: string;
  amountPence: number;
  currency: "GBP";
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  sortCode: string; // digits only, 6 chars
  accountNumber: string; // digits only, 8 chars
  payeeName: string;
  description: string;
  contactPhone: string | null; // phone number printed on the invoice, if any (never to be called for §4)
}

export interface ExtractionPair {
  a: Extraction;
  b: Extraction;
  agree: boolean;
  disagreements: string[]; // field names that differ
}

export interface HistoryItem {
  supplierId: string;
  invoiceNumber: string;
  amountPence: number;
  paidAt: string; // ISO date
  stripeId: string; // tr_… or po_…
  sortCode: string;
  accountNumber: string;
}

export interface MemoryFact {
  text: string;
  source: "cognee" | "local";
}

export interface CheckerInput {
  extraction: Extraction;
  extractionPair: ExtractionPair;
  supplier: Supplier | null; // null → not in the register
  history: HistoryItem[]; // all paid invoices (every supplier)
  availableBalancePence: number;
  memory: MemoryFact[]; // facts retrieved for this supplier
  verifiedBankChanges: VerifiedBankChange[]; // human-verified changes recorded this session
  policyVersion: string;
  now: string; // ISO, injected for determinism
}

export interface Check {
  clause: string; // "§4"
  title: string; // "Bank-detail change"
  passed: boolean;
  evidence: string; // one line a judge can read
}

export interface CheckerResult {
  verdict: Verdict;
  checks: Check[];
  citedClauses: string[]; // the clauses that decided the verdict
  reason: string; // one sentence
  requiredApprovers: number; // 0 for PAY, 1 or 2 for HOLD under §2
}

export interface VerifiedBankChange {
  supplierId: string;
  from: BankDetails;
  to: BankDetails;
  verifiedBy: string;
  verifiedAt: string;
  method: string; // "callback to phone on file"
}

export type DecisionStatus =
  | "paid" // PAY → Stripe call succeeded
  | "held" // HOLD, waiting for a human
  | "rejected" // REJECT by checker, or human reject
  | "approved_paid" // HOLD → human approved → Stripe call succeeded
  | "failed"; // Stripe call failed

export interface StripeOutcome {
  object: "transfer" | "payout";
  id: string;
  amountPence: number;
  createdAt: string;
  dashboardUrl: string;
}

export interface Decision {
  id: string; // "dec_…" — also the Stripe idempotency key
  invoiceId: string;
  createdAt: string;
  supplierId: string | null;
  extraction: ExtractionPair;
  verdict: Verdict;
  checks: Check[];
  citedClauses: string[];
  reason: string;
  requiredApprovers: number;
  memoryUsed: MemoryFact[];
  policyVersion: string;
  status: DecisionStatus;
  stripe?: StripeOutcome;
  human?: { action: "approve" | "reject" | "verified_by_phone"; by: string; at: string; note: string };
  error?: string;
  timeline: { at: string; event: string }[]; // audit trail, appended in order
}

export interface Runtime {
  decisions: Decision[];
  history: HistoryItem[]; // fixtures history + payments made this session
  verifiedBankChanges: VerifiedBankChange[];
  memoryLog: { at: string; dataset: string; text: string }[]; // everything written to memory this session
  seeded: boolean;
  suppliers: Supplier[]; // fixtures + connectedAccountId filled at seed
  inboxExtra: Invoice[]; // invoices dropped in live via POST /api/inbox
}

export const POLICY_VERSION = "1.0 (2026-10-15)";
export const AUTO_PAY_LIMIT_PENCE = 200_000; // §2 ≤ £2,000.00
export const ONE_APPROVER_LIMIT_PENCE = 1_000_000; // §2 ≤ £10,000.00
export const ROLLING_30D_CAP_PENCE = 500_000; // §2 £5,000.00 per supplier
export const CASH_FLOOR_PENCE = 500_000; // §7 £5,000.00
export const PLAUSIBILITY_RATIO = 1.5; // §6 150% of trailing average
export const DUPLICATE_WINDOW_DAYS = 7; // §3

export const formatGBP = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

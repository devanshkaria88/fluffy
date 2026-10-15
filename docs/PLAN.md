# Clearance — build plan (15 Oct 2026, Briefcase × Stripe hackathon)

**Track 01 — Agents that Spend.** Clearance is the accounts-payable agent that can't pay the wrong supplier: every pound is cleared by a written rule, the rule is stamped on the Stripe transfer itself, and the moment a supplier's bank details change the payment freezes.

## Why this idea
- Jan Stehlik's (Briefcase) public thesis is "build for verification, not review". Clearance is that thesis applied to money: a deterministic checker returns PAY / HOLD / REJECT with a clause number; the LLM only extracts, it never decides.
- Briefcase's own MCP deliberately cannot move money. Stripe can. This is the gap the event is about.
- Invoice-redirection fraud is the UK's biggest supplier-payment loss; the §4 freeze is a moment judges can feel.
- Rubric mapping: money moves (Connect transfer / payout, 35) · explicit policy §1–§7 (25) · audit row + clause on the Stripe object (20) · finance teams want it, verification-not-review is the original angle (20). Cognee holds the policy and supplier memory → side quest.

## Architecture (single Next.js app)
`inbox → extract ×2 (Claude, temp 0) → memory (Cognee + local mirror) → checker (pure) → executor (Stripe) → audit row`

- `lib/types.ts` — shared contracts
- `policy/ap-policy.md` — the written policy, §1–§7
- `data/fixtures/*` — suppliers, history, 7 inbox invoices (3 PAY, 3 HOLD, 1 REJECT)
- `lib/checker.ts` — pure; imports no SDK
- `lib/extract.ts` — double extraction, agreement gate (§5)
- `lib/memory.ts` — Cognee seed / search / add, with local mirror for hard gates
- `lib/executor.ts` — transfers.create (fallback payouts.create), idempotency = decision id, metadata = clauses
- `app/api/*` — seed, run, state, decisions/[id] approve|reject|verified, replay, reset, evals
- `app/page.tsx` — one page: Inbox · Decision stream · Holds · Balance · Keys & powers

## Schedule
- 18:30 contracts written (this file) → parallel build of checker+evals, extractor+memory, executor+routes, UI
- 19:05 integrate, first end-to-end run with money moving
- 19:40 human loop + memory writes + replay
- 20:05 evals page, README, polish
- 20:30 record 2-minute video, submit by 21:00

## Cut
PDF/OCR, email ingestion, two-approver UI, cashflow scheduling, webhooks, auth, DB, chat UI, Issuing, Treasury.

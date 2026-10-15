# Settle — live finalist demo (3 minutes, 21:35)

Judges: Jan (Briefcase), Fionn (Stripe), David (No10), Dominic (Meta), Akash (Earlybird), Ankit (DeepMind). You have 3 minutes on stage; aim to finish at 2:30 and leave 30s for a question.

## Before you walk up (do this at 21:25)
- `curl -s -X POST localhost:3000/api/reset && curl -s -X POST localhost:3000/api/seed` → clean board, fresh escrow, Fluffy idle. (Or ask me and I'll do it.)
- Chrome tabs, in order: **Settle** (localhost:3000) · **Stripe → Connect → Transfers** (test) · **PR #2** on GitHub. Nothing else open. Laptop on power, notifications off, display mirrored.
- Pre-warm: both verifies have been run many times tonight, so clones and installs are cached; a verify takes ~12s.
- Have the fallback ready: if the venue Wi-Fi dies, the previous run's decisions are in `data/runtime.json`; just don't press Reset.

## The 3 minutes

**0:00 — Problem (20s, no clicking).**
"Freelance developers get paid late for work that's already done. Clients sit on PRs, dispute scope after the fact, net-30 becomes net-90. Settle is escrow without an arbiter: the milestone document is the contract, and Fluffy — our agent — pays the second the evidence says the work is done."

**0:20 — The contract (15s).** Point at the milestone header: five requirements, £1,200, escrow funded — a real Stripe PaymentIntent. "Seven written rules. The language model never decides whether money moves. A deterministic checker does."

**0:35 — HOLD (45s).** Board view. Click **Verify** on PR #1. While Fluffy thinks, narrate the stages as they appear in the sidebar: "checks out the PR, runs the suite — 4 of 4 green — asks memory what this client expects, then two independent verifiers on Haiku read the diff and every test." Card slides to **Held — needs work**. Open it: R4 pagination not met, both verifiers agree, no test exists; §4 red, everything else green. "The report is already a comment on the PR — the freelancer knows exactly what to ship."

**1:20 — PAY (45s).** Click **Verify** on PR #2. "Same PR plus pagination and its test." Card lands in **Paid**; the wallet below flashes **+£1,200.00**. Click the `tr_` link → Stripe transfer: "Connect transfer, funded by the client's escrow charge — `source_transaction` — with the decision id as the idempotency key and the clauses in the metadata. Every pound is explained on the Stripe object itself."

**2:05 — Why it can't go wrong (25s).** Click **Replay** on the paid card: "Same decision, same key — Stripe returns the same transfer. Paying twice is impossible by construction." Click **Evals**: "The checker against ten scenarios — unfunded, wrong author, red suite, missing requirement, disagreeing verifiers, over-limit, already paid."

**2:30 — Close (15s).** "Every decision carries its tests, both verifier reports, the cross-check, the policy table, the memory it used, the Stripe object and the GitHub comment. For developers who build with AI, this is the loop: optimise against the milestone's tests, get paid when they pass. Settle."

## Likely questions, short answers
- **"The LLM could be wrong."** Two verifiers with different framings must agree, every claim must cite a test that actually ran and passed (checked in code), and the checker — not the model — decides. Disagreement is a HOLD with a human reviewer (§7).
- **"You run untrusted PR code."** Yes, in a worktree on the demo laptop; production runs it in an isolated sandbox with no network and no secrets. The verifiers have no Stripe key at all.
- **"What stops the client refusing to pay?"** They pre-committed by funding escrow and writing the requirements; once §1–§6 pass they can't revoke (§7). What stops the freelancer gaming it? The tests are the client's acceptance tests, named per requirement, and test count can't shrink (§3).
- **"Why would a finance team want it?"** No invoices, no chasing, no month-end: the merged PR is the invoice, the transfer carries the audit trail, and the ledger entry writes itself. For agencies and startups paying contractors it removes a whole workflow.
- **"Where's the memory used?"** Cognee holds the milestone, the policy and the client's acceptance history; every verification quotes it (Memory section in the panel) and every outcome is written back, so the next decision cites the last one.
- **"Business model?"** A percentage of each release, like escrow has always charged — but with the arbiter's cost removed.

# Settle — 2-minute demo script

Judges stop watching at 2:00. Money must visibly move before 1:30. Record at 1080p, dashboard on the left two-thirds, Stripe dashboard / GitHub PR tab ready on the right. Speak at 120% energy.

## 0:00 – 0:15 · The problem (talk over the dashboard, nothing moving yet)
"Freelance developers get paid late for work that's already done. Clients sit on PRs, dispute scope after the fact, net-30 becomes net-90. This is Settle: the client writes the milestone, the freelancer ships the PR, and **Fluffy** — our escrow agent — pays the second the work is provably done. No invoice. No arbiter."

## 0:15 – 0:30 · The contract
Point at the milestone header: "Milestone M1, five requirements, £1,200, escrow funded by the client — that's a real Stripe PaymentIntent." Point at Policy: "Seven written rules. The language model never decides whether money moves; a deterministic checker does."

## 0:30 – 1:00 · The HOLD (PR #1)
Click **Verify** on PR #1. Fluffy goes to *thinking*. Narrate the activity line as it changes: "Checks out the PR, runs the suite — 4 of 4 green — recalls what this client expects from memory, then two independent verifiers on Haiku read the diff and every test." Result: **HELD under §4**. Open the detail panel: "R1, R2, R3, R5 met, each with a named passing test. R4 — pagination — not met, both verifiers agree, no test exists. The report is already a comment on the PR." Flash the GitHub tab.

## 1:00 – 1:30 · The PAY (PR #2)
Click **Verify** on PR #2: "The freelancer adds pagination and its test." Fluffy *happy*. **£1,200.00 released.** Click the transfer id → Stripe dashboard: "Connect transfer, funded by the client's escrow charge, decision id as the idempotency key, the clauses in metadata." Back to the panel: §1–§7 all green.

## 1:30 – 1:50 · Why it can't go wrong
Click **Replay** on the paid decision: "Same decision, same idempotency key — Stripe returns the *same* transfer. Paying twice is impossible by construction." Click **Evals**: "The checker against ten scenarios: unfunded, wrong author, red suite, missing requirement, disagreeing verifiers, over-limit, already paid."

## 1:50 – 2:00 · Close
"Every pound Fluffy moves is explained: tests, two verifiers, cross-check, policy, Stripe object, GitHub comment, memory. For developers who build with AI, this is the workflow: optimise against the milestone's tests and get paid when they pass. Settle." Cut.

## Fallbacks
- If Cognee is slow, the verify still runs on local facts; don't wait on the memory line.
- If GitHub comment posting fails, show the dashboard panel only.
- Pre-run both verifications once before recording so the git clone and pnpm install caches are warm; then **Reset → Seed** and record for real.

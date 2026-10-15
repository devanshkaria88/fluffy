# Fluffy — the escrow agent that pays freelancers the moment the work is provably done

**Track 01 · Agents that Spend** · Briefcase × Stripe hackathon, London, 15 October 2026

> The client writes the milestone. The freelancer ships the PR. **Fluffy** runs the tests, verifies every requirement with evidence, checks the written policy, and releases the escrow with a Stripe transfer — no invoice, no chasing, no "we'll pay you at month end".

## The problem

Freelance developers get paid late, or not at all, for work that was done. Clients sit on PRs, dispute scope after the fact, and "net 30" turns into net 90. Escrow fixes trust but adds a human arbiter. Fluffy replaces the arbiter with verification: the milestone document *is* the contract, and the agent only pays when the evidence says every requirement is met.

For developers who build with AI, this flips the workflow: optimise your PR against the same tests and requirements the escrow agent uses, and you get paid the second it passes.

## What happens on a PR

```
PR opened ──▶ fetch + checkout ──▶ run test suite ──▶ recall project memory (Cognee)
         ──▶ verifier A  ┐
         ──▶ verifier B  ┴─▶ cross-check cited tests against real results
         ──▶ policy checker §1–§7 (deterministic) ──▶ PAY → Stripe transfer (idempotent)
                                                    └─▶ HOLD → report on the PR, human review
```

- **Two independent verifiers** (`claude-haiku-5-5`, different framings, temperature 0) each assess every requirement and must cite a named passing test. They must agree. A cited test that didn't run or didn't pass voids the evidence.
- **The checker is pure TypeScript.** The language models verify; they never decide whether money moves.
- **Money moves on Stripe (test mode):** the client funds escrow with a PaymentIntent; release is a Connect transfer to the freelancer's account, funded by that specific charge (`source_transaction`), with the decision id as the idempotency key and the policy clauses in metadata.
- **Every pound is explained:** per-requirement verdicts with evidence, both verifier reports, the §1–§7 check table, the memory facts used, the Stripe object, the GitHub comment, and a timestamped timeline — on the dashboard and as a comment on the PR.
- **Memory (Cognee):** the milestone, the policy and the client's acceptance history are the project's memory. Fluffy recalls them before verifying and records every outcome and reviewer note after, so the next decision cites the last one.

## The policy

[policy/escrow-policy.md](policy/escrow-policy.md) — §1 escrow funded · §2 right work, right person · §3 suite green and not shrinking · §4 every requirement, two verifiers, real evidence · §5 amount and limits · §6 one payment per milestone · §7 guardrails and disputes.

## Demo

Demo client project: [devanshkaria88/settle-demo-invoicing](https://github.com/devanshkaria88/settle-demo-invoicing) — milestone M1, £1,200.00, five requirements.

1. **Seed** — client funds £1,200 escrow (`pi_…`), freelancer's Connect account is created, memory is seeded.
2. **Verify PR #1** — implements R1, R2, R3, R5. Tests green. Verifiers agree R4 (pagination) is not met → **HOLD under §4**, report posted to the PR.
3. **Verify PR #2** — adds R4 with its test. 5/5 met, §1–§7 pass → **£1,200.00 released**, `tr_…` visible in the Stripe dashboard with the clauses in metadata, comment on the PR.
4. **Replay** the paid decision → Stripe returns the *same* transfer id. Paying twice is impossible by construction.
5. **Evals** — the policy checker against ten scenarios.

## Run it

```bash
pnpm install
cp .env.example .env   # STRIPE_SECRET_KEY (test), ANTHROPIC_API_KEY; optional COGNEE_API_KEY / COGNEE_BASE_URL, STRIPE_FREELANCER_ACCOUNT_ID, STRIPE_EXECUTOR_KEY
pnpm dev
```

Requires the `gh` CLI logged in (the agent reads PRs and posts comments with it) and a Stripe account with Connect enabled (platform liable for losses, acknowledged in the Dashboard). `pnpm evals` runs the checker evals.

Stripe objects from a real run: escrow `pi_3UQtZq6YRYM7Lp5g1k7I2l33` → release `tr_3UQtZq6YRYM7Lp5g10pVH03X` (£1,200.00, `source_transaction` = the escrow charge) to the freelancer's Connect account `acct_1UQtVT6YRYdjX2WX`; decision `dec_129de400277f`; report on [PR #2](https://github.com/devanshkaria88/settle-demo-invoicing/pull/2).

## Separation of powers

| Actor | Holds | Can |
|---|---|---|
| Verifiers (Claude) | no Stripe key | read the diff and tests, cite evidence |
| Checker | nothing | apply §1–§7, return PAY / HOLD |
| Executor | restricted key (transfers: write, balance: read) | release exactly the milestone amount, once |
| Reviewer (human) | a name and a note | release or uphold a HOLD; the note becomes memory |

> Running a PR's test suite executes untrusted code. The demo runs it locally; production would run it in an isolated sandbox.

## Stack

Next.js 16 · TypeScript · Stripe (PaymentIntents, Connect transfers) · Anthropic (`claude-haiku-5-5`, tool use) · Cognee Cloud · `gh` CLI · vitest JSON reporter.

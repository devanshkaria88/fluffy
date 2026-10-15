# Fluffy — build notes (15 Oct 2026, Briefcase × Stripe hackathon)

**Track 01 — Agents that Spend.** Fluffy is an escrow agent for freelance developers. The client writes the milestone and funds escrow; the freelancer opens a PR; **Fluffy** runs the tests, has two independent verifiers assess every requirement with cited evidence, applies a written policy, and releases the escrow on Stripe the moment the work is provably done.

## Why this idea
- Freelancers get paid late for finished work. Escrow fixes trust but needs an arbiter; verification replaces the arbiter.
- It is Jan Stehlik's "verification, not review" thesis turned into a product for a different buyer: the language model verifies and cites, a deterministic checker decides, Stripe moves the money.
- For developers who build with AI it inverts the workflow: optimise the PR against the milestone's tests and get paid when they pass.
- Rubric: money moves on Stripe (35) · explicit policy §1–§7 with the LLM out of the decision (25) · per-requirement evidence, both reports, cross-check, Stripe object, GitHub comment, timeline (20) · a product a finance team at any agency would use, and nobody else in the room is paying on proof (20). Cognee holds the project scope and the client's acceptance history → side quest.

## Architecture (single Next.js app)
`PR → gh fetch + worktree → vitest (JSON) → recall (Cognee + local) → verifier A ∥ verifier B (claude-haiku-5-5) → cross-check cited tests → checker §1–§7 (pure) → Stripe transfer (idempotent) → PR comment → memory`

- `lib/types.ts` — shared contracts · `policy/escrow-policy.md` — the written policy
- `lib/github.ts` — gh/git wrappers, worktrees under `.fluffy/`, vitest JSON reporter
- `lib/verify.ts` — two verifiers, strict tool schema, cross-check against real test results
- `lib/memory.ts` — Cognee seed / recall / remember, local facts always
- `lib/checker.ts` — pure policy checker · `lib/evals.ts` — ten scenarios
- `lib/executor.ts` — escrow funding, Connect account, release with `source_transaction`, idempotency key = decision id
- `lib/pipeline.ts` — orchestration, activity stages, audit timeline
- `app/api/*` — state, seed, verify, decisions, replay, reset, evals, policy
- `app/page.tsx` + `components/*` — Linear-style dashboard, `Fluffy.tsx` face ported from an earlier project

## Timeline tonight
18:00 research · 18:30 idea locked · 18:45 contracts · 18:55–19:05 four builders in parallel + integrator · 19:05 first live release · 19:05–20:25 Connect, Cognee, polish, rehearsal · 20:30 record · 21:00 submit

## Cut
Webhooks, GitHub App auth, sandboxed test execution, multi-milestone contracts, client co-sign UI above £5,000, disputes beyond release/uphold.

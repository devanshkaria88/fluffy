# Settle — integration report (2026-10-15, ~18:05 BST)

End-to-end loop proven live against GitHub + Stripe test mode + claude-haiku-5-5.
Dev server left running on **http://localhost:3000** (`pnpm dev -p 3000`, log in the session scratchpad `dev.log`).

## What works

| Step | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm exec eslint app components lib scripts` | clean |
| `.env` | `ANTHROPIC_API_KEY` set (LLM verification ran live). `COGNEE_API_KEY` unset → memory logged locally only, `cogneeEnabled:false`. |
| `POST /api/reset` | `{ ok: true }` |
| `POST /api/seed` | escrow funded `pi_3UQss3Qqv2SoA9F000S7rNgz` (charge `ch_3UQss3Qqv2SoA9F00S5RfmOd`, £1,200.00). Connected account: **null** (see Known issues). Memory: 14 docs logged locally, Cognee off. |
| `POST /api/verify {ms_m1, 1}` | **HOLD** — decision `dec_187f80680e6a`, verification `ver_187f80680e6a`. §4 fails (R4 not met by both verifiers; verifiers disagree on R2). Tests 4/4 (base 1). ~12s. PR comment: https://github.com/devanshkaria88/settle-demo-invoicing/pull/1#issuecomment-6198793404 |
| `POST /api/verify {ms_m1, 2}` | **PAY** — decision `dec_c77649ba7086`, verification `ver_c77649ba7086`. §1–§7 all pass, R1–R5 met by both verifiers, 5/5 tests. Released £1,200.00 → Stripe **`po_1UQsxfQqv2SoA9F00XjQehVU`** (payout fallback, see below). PR comment: https://github.com/devanshkaria88/settle-demo-invoicing/pull/2#issuecomment-6198808398 |
| `POST /api/replay/dec_c77649ba7086` | `{ sameStripeId: true, stripeId: "po_1UQsxfQqv2SoA9F00XjQehVU" }` — idempotency key = decision id, no second payment. |
| `POST /api/replay/dec_187f80680e6a` | HTTP 409 — executor refuses to pay a HOLD. |
| `GET /api/evals` | 10/10 pass |
| `GET /api/policy` | 200 text/markdown |
| `GET /api/state` | balance £417.35 after release; agent Fluffy / claude-haiku-5-5; policy 1.0 (2026-10-15); prs ms_m1 → [#2, #1]; two decisions. |
| UI at :3000 | Renders milestone header, PR rows (status icon, tests, reqs, verdict, last activity, Verify/Replay), detail panel (decision, Stripe link, PR comment link, replay button, policy checks §1–§7, requirements, tests, memory, timeline). Fluffy blob + agent dots render and change mood with `runtime.activity`. |

## Exact demo commands

```bash
pnpm dev -p 3000                       # already running
curl -s -X POST localhost:3000/api/reset
curl -s -X POST localhost:3000/api/seed
curl -s -X POST localhost:3000/api/verify -H 'content-type: application/json' -d '{"milestoneId":"ms_m1","prNumber":1}'   # HOLD §4
curl -s -X POST localhost:3000/api/verify -H 'content-type: application/json' -d '{"milestoneId":"ms_m1","prNumber":2}'   # PAY
curl -s -X POST localhost:3000/api/replay/<decisionId>
curl -s localhost:3000/api/evals
gh pr view 1 --repo devanshkaria88/settle-demo-invoicing --comments
```

Decision ids are deterministic per (milestone, headSha): `dec_` + sha256(ms_m1 + headSha).slice(12), so a re-run after reset yields the same ids, and the same Stripe idempotency key.

## Integration fixes made

- `app/api/{state,evals,policy}/route.ts`: removed `export const dynamic = "force-dynamic"` — incompatible with `cacheComponents: true` in `next.config.ts` (routes returned 500).
- `app/page.tsx`: `now` / `mountedAt` state initialised to 0 and set in the poll effect — Next 16 refused `Date.now()` during client prerender.
- `components/PRList.tsx`: PR rows use `StatusIcon` (icon only) instead of `Status` (icon + label) — the label overflowed the 18px first grid column and overlapped the PR number.

## Known issues / still broken

1. **Stripe Connect is not enabled on the key in `.env`** (`accounts.create` → "You can only create new accounts if you've signed up for Connect"). `seed()` therefore leaves `freelancerConnectedAccountId: null` and `release()` falls back to a **platform payout** (`object: "payout"`, same idempotency key = decision id) instead of a Connect transfer. Fix: enable Connect at https://dashboard.stripe.com/test/connect or set `STRIPE_FREELANCER_ACCOUNT_ID=acct_…` in `.env`, then `POST /api/reset` + `/api/seed` + verify PR 2 again; the transfer path (with `source_transaction` = escrow charge, retry without) is coded but untested live.
2. **Cognee** off (`COGNEE_API_KEY` unset): memory facts are local-only (`runtime.memoryLog`); recall still works from local decisions.
3. Available test balance is now £417.35 — a second full £1,200 release would fail §7 (insufficient balance) unless the sandbox balance is topped up (each `seed` funds a new PI only if the idempotency key changes; the current PI is reused).
4. `executorKeyScope` reports "test secret key (no restricted key configured)" — set `STRIPE_EXECUTOR_KEY=rk_test_…` for the restricted-key story.
5. Not committed — the orchestrator commits.

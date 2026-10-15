# Fluffy — integration notes (15 Oct 2026, 19:41 BST)

End-to-end loop proven live against GitHub + Stripe test mode (Connect) + claude-haiku-5-5.

| Step | Result |
|---|---|
| `pnpm typecheck` | clean |
| `POST /api/seed` | escrow `pi_3UQtZq6YRYM7Lp5g1k7I2l33` (£1,200.00), freelancer account `acct_1UQtVT6YRYdjX2WX` (stripe_transfers active) |
| `POST /api/verify {ms_m1, 2}` | **PAY** — 5/5 requirements, verifiers agree, 5/5 tests → transfer `tr_3UQtZq6YRYM7Lp5g10pVH03X`, `source_transaction` = escrow charge; decision `dec_129de400277f`; comment on PR #2 |
| `POST /api/verify {ms_m1, 1}` | **HOLD** — 4/5 (R4 not met by both verifiers), §4 fails; comment on PR #1 |
| `POST /api/replay/dec_129de400277f` | `{ sameStripeId: true }` — same idempotency key, no second payment |
| `POST /api/replay/<held>` | 409 — executor refuses a HOLD |
| `GET /api/evals` | 10/10 |

## Things learned the hard way

- New Stripe accounts refuse Accounts v1; recipient accounts are created with Accounts v2 (`configuration.recipient`, `losses_collector: application`, which needs the one-time loss-liability acknowledgement in the Dashboard's Connect platform profile).
- The `stripe_transfers` capability activates when identity + terms acceptance are supplied *after* Stripe's first evaluation; supplying them in the create call, or updating too early, leaves it in `determining_status`. The executor waits for `restricted` before updating. `STRIPE_FREELANCER_ACCOUNT_ID` pins an already-active account (the demo does this).
- Decision ids include the escrow PaymentIntent, so re-funding a milestone is a new decision while replays within a funding stay idempotent. A failed Stripe call is cached under its idempotency key, so a retry needs a new decision.
- Verifier disagreement on an ambiguous requirement is a real HOLD, not a bug; the fix was to make R2 unambiguous in the milestone.

## Demo order
Reset → Seed → Verify PR #1 (HOLD §4) → Verify PR #2 (PAY, transfer) → Replay → Evals.

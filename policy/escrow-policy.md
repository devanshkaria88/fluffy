# Settle Escrow Policy — version 1.0 (15 October 2026)

This policy governs every milestone payment released by the Settle agent. The agent may only release funds on a verdict produced by the deterministic checker. Language models verify requirements and cite evidence; they never decide whether money moves.

## §1 Escrow must be funded
A milestone is verified and paid only if the client has funded escrow for at least the milestone amount, recorded as a succeeded Stripe PaymentIntent. An unfunded milestone is never verified for payment.

## §2 The right work from the right person
The pull request must target the agreed repository and base branch and be authored by the contracted freelancer's GitHub login. Any other author or target is HELD.

## §3 The suite must be green and must not shrink
The full test suite must pass on the pull request head with zero failures, and the number of tests must be no lower than on the base branch. A red or shrinking suite is HELD.

## §4 Every requirement, two verifiers, real evidence
Two independent verifiers, prompted differently, each assess every requirement in the milestone document. A requirement counts as MET only if both verifiers agree it is met and each cites evidence: for a testable requirement, at least one named test that actually ran and passed in §3; for a non-testable requirement, a specific file and line or document section. A cited test that did not run or did not pass voids that evidence. Any requirement not met, or any disagreement between verifiers, is HELD and the full report is posted to the pull request.

## §5 Amount and limits
The release equals the milestone amount exactly. Milestones up to £5,000.00 are released automatically. Above £5,000.00 the client must co-sign the release.

## §6 One payment per milestone
A milestone is paid at most once. The decision id is deterministic (milestone, pull request head, policy version) and is the Stripe idempotency key, so a replayed release returns the original transfer and can never pay twice.

## §7 Guardrails and disputes
The executor holds a Stripe key restricted to Transfers (write) and Balance (read); verifiers hold no Stripe key. The audit row is written before the Stripe call and updated with the transfer id after it. On a HOLD the freelancer may request human review; a named reviewer may release or uphold with a written note, which is recorded in memory and cited on later decisions. Once §1–§6 pass, the client cannot revoke the release.

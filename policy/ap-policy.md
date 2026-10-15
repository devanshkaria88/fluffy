# Accounts Payable Policy — version 1.0 (15 October 2026)

This policy governs every supplier payment made by the Clearance agent. The agent may only act on a verdict produced by the deterministic checker; the language model never decides whether money moves.

## §1 Approved suppliers only
The agent pays only suppliers listed in the Approved Supplier Register with status ACTIVE and bank details verified by a named person on a recorded date. An invoice from a supplier that is not in the register, or whose status is SUSPENDED, is HELD for the Finance Lead. It is never paid automatically.

## §2 Limits and approvals
An invoice up to £2,000.00 is paid automatically. An invoice from £2,000.01 to £10,000.00 requires one named approver. An invoice above £10,000.00 requires two approvers. Payments to a single supplier may not exceed £5,000.00 in any rolling 30-day period; an invoice that would breach the cap is HELD. An invoice is never split to fit a limit.

## §3 Duplicates
An invoice whose supplier and invoice number match an invoice already paid is REJECTED as a duplicate, citing the earlier payment. An invoice from the same supplier for the same amount within 7 days of a paid invoice is HELD as a probable duplicate unless a human marks it distinct.

## §4 Bank-detail change (invoice-redirection fraud)
If the sort code or account number on an invoice differs from the verified details held in the register, the invoice is HELD regardless of amount and flagged as possible invoice-redirection fraud. A human must verify the change by calling the phone number held in the register — never a number printed on the invoice. The agent never updates bank details itself. A verified change is recorded in memory with who verified it and when, and is cited on every later payment to the new details.

## §5 Evidence
Two independent extractions of the invoice must agree exactly on supplier, invoice number, amount, sort code and account number, and all required fields must be present. Any disagreement is HELD with both readings shown side by side. Readings are never averaged or guessed.

## §6 Plausibility
An invoice above 150% of the supplier's trailing three-invoice average is HELD unless memory records an approved reason for the increase.

## §7 Execution guardrails
The executor holds a Stripe key restricted to Transfers (write) and Balance (read); the language model holds no Stripe key. Human approvals are recorded by a separate actor. Available balance must remain at or above £5,000.00 after a payment, otherwise the invoice is HELD. The idempotency key for every Stripe call is the decision id, so a replayed decision can never pay twice. The audit row is written before the Stripe call and updated with the Stripe object id after it. Nothing executes without a checker verdict of PAY, or a HOLD that a named human has approved.

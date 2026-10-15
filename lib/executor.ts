// The only module that moves money. Ops (seed) use the platform key; release() uses the
// executor key (ideally a restricted key: transfers write + balance read).
import Stripe from "stripe";
import { stripe } from "./stripe";
import { AGENT_NAME, POLICY_VERSION, type Decision, type Escrow, type Milestone, type StripeOutcome } from "./types";

const EXEC_KEY = process.env.STRIPE_EXECUTOR_KEY;

const metadataFor = (decision: Decision, milestone: Milestone) => ({
  decision_id: decision.id,
  milestone_id: milestone.id,
  pr: String(decision.prNumber),
  head_sha: decision.headSha,
  policy_version: decision.policyVersion || POLICY_VERSION,
  policy_clauses: decision.citedClauses.join(","),
  verification_id: decision.verificationId,
  agent: AGENT_NAME,
});

/** Fallback when Stripe Connect is not enabled on the platform account: pay out from the platform
 *  balance to its test bank account with the same deterministic idempotency key. */
async function releaseAsPayout(decision: Decision, milestone: Milestone): Promise<StripeOutcome> {
  const p = await executor.payouts.create(
    {
      amount: milestone.amountPence,
      currency: "gbp",
      description: `Settle release ${milestone.id} PR #${decision.prNumber} (payout fallback, no Connect account)`,
      metadata: metadataFor(decision, milestone),
    },
    { idempotencyKey: decision.id },
  );
  return {
    object: "payout",
    id: p.id,
    amountPence: p.amount,
    createdAt: new Date(p.created * 1000).toISOString(),
    dashboardUrl: "https://dashboard.stripe.com/test/payouts/" + p.id,
    sourceTransaction: null,
  };
}
const executor = EXEC_KEY ? new Stripe(EXEC_KEY, { appInfo: { name: "settle-executor" } }) : stripe;

export function executorKeyScope(): string {
  return EXEC_KEY?.startsWith("rk_")
    ? "restricted · transfers:write balance:read"
    : "test secret key · unrestricted";
}

export async function fundEscrow(milestone: Milestone): Promise<Escrow> {
  const pi = await stripe.paymentIntents.create(
    {
      amount: milestone.amountPence,
      currency: "gbp",
      payment_method: "pm_card_bypassPending",
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: "Escrow for " + milestone.title,
      metadata: { milestone_id: milestone.id, client: milestone.clientName, purpose: "escrow" },
    },
    // One funding per seed: after a reset the milestone has no escrow, so a fresh PaymentIntent is created.
    { idempotencyKey: "escrow-" + milestone.id + "-" + Date.now() },
  );
  const charge = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null);
  return {
    paymentIntentId: pi.id,
    chargeId: charge,
    amountPence: pi.amount,
    fundedAt: new Date(pi.created * 1000).toISOString(),
    status: "funded",
  };
}

export async function ensureFreelancerAccount(milestone: Milestone): Promise<string> {
  if (milestone.freelancerConnectedAccountId) return milestone.freelancerConnectedAccountId;
  if (process.env.STRIPE_FREELANCER_ACCOUNT_ID) return process.env.STRIPE_FREELANCER_ACCOUNT_ID;
  const [first, ...rest] = milestone.freelancerName.split(" ");
  const params: Stripe.AccountCreateParams = {
    country: "GB",
    controller: {
      stripe_dashboard: { type: "none" },
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: "application",
    },
    capabilities: { transfers: { requested: true } },
    business_type: "individual",
    individual: { first_name: first || "Devansh", last_name: rest.join(" ") || "Karia", email: "freelancer@example.com" },
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "8.8.8.8", service_agreement: "recipient" },
    metadata: { freelancer_login: milestone.freelancerLogin, milestone_id: milestone.id },
  };
  // New Stripe accounts require Accounts v2 for connected-account creation; older accounts still accept v1.
  try {
    // Two steps on purpose: create the recipient account, then supply test-mode identity + terms acceptance.
    // Supplying them in the create call leaves stripe_transfers stuck in "determining_status"; the update re-evaluates it.
    const created = await stripe.v2.core.accounts.create({
      display_name: milestone.freelancerName,
      contact_email: "freelancer@example.com",
      identity: { country: "gb", entity_type: "individual" },
      defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
      dashboard: "none",
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      metadata: { freelancer_login: milestone.freelancerLogin, milestone_id: milestone.id },
    });
    const capability = (a: Stripe.V2.Core.Account) =>
      a.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
    // Stripe evaluates the new account asynchronously; updating while it is still "pending" leaves it stuck.
    // Wait for the first evaluation (status becomes "restricted" with requirements due), then supply them.
    let settled = created;
    for (let i = 0; i < 8 && (capability(settled) ?? "pending") === "pending"; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      settled = await stripe.v2.core.accounts.retrieve(created.id, { include: ["configuration.recipient"] });
    }
    let a = await stripe.v2.core.accounts.update(created.id, {
      defaults: { profile: { business_url: `https://github.com/${milestone.freelancerLogin}` } },
      identity: {
        individual: {
          given_name: first || "Devansh",
          surname: rest.join(" ") || "Karia",
          date_of_birth: { day: 1, month: 1, year: 1990 },
          address: { country: "gb", line1: "1 Clerkenwell Road", city: "London", postal_code: "EC1M 5PQ" },
        },
        attestations: { terms_of_service: { account: { date: new Date().toISOString(), ip: "8.8.8.8" } } },
      },
      include: ["configuration.recipient"],
    });
    for (let i = 0; i < 10 && capability(a) !== "active"; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      a = await stripe.v2.core.accounts.retrieve(created.id, { include: ["configuration.recipient"] });
    }
    if (capability(a) !== "active") throw new Error(`stripe_transfers capability still ${capability(a)} on ${created.id}`);
    return created.id;
  } catch (e) {
    const msg = String((e as Error).message);
    // "Please review the responsibilities of managing losses" needs a one-time Dashboard acknowledgement; surface it.
    if (/responsibilities of managing losses|capability still/i.test(msg)) throw e;
  }
  try {
    return (await stripe.accounts.create(params)).id;
  } catch (e) {
    if (!/service_agreement/i.test(String((e as Error).message))) throw e;
    const { service_agreement: _omit, ...tos } = params.tos_acceptance!;
    void _omit;
    return (await stripe.accounts.create({ ...params, tos_acceptance: tos })).id;
  }
}

export async function availableBalancePence(): Promise<number> {
  const b = await executor.balance.retrieve();
  return b.available.filter((x) => x.currency === "gbp").reduce((s, x) => s + x.amount, 0);
}

export async function release(decision: Decision, milestone: Milestone): Promise<StripeOutcome> {
  if (decision.verdict !== "PAY" && decision.human?.action !== "release") {
    throw new Error(`executor refuses: decision ${decision.id} is ${decision.verdict} with no human release`);
  }
  const acct = milestone.freelancerConnectedAccountId;
  if (!acct) return releaseAsPayout(decision, milestone);

  const base: Stripe.TransferCreateParams = {
    amount: milestone.amountPence,
    currency: "gbp",
    destination: acct,
    transfer_group: milestone.id,
    description: `Settle release ${milestone.id} PR #${decision.prNumber}`,
    metadata: metadataFor(decision, milestone),
  };
  const src = milestone.escrow?.chargeId ?? undefined;
  let t: Stripe.Transfer;
  try {
    t = await executor.transfers.create(src ? { ...base, source_transaction: src } : base, { idempotencyKey: decision.id });
  } catch (e) {
    if (!src || !/source_transaction/i.test(String((e as Error).message))) throw e;
    // Same deterministic key family so a replay walks the same path and lands on the same transfer.
    t = await executor.transfers.create(base, { idempotencyKey: decision.id + "-nosrc" });
  }
  return {
    object: "transfer",
    id: t.id,
    amountPence: t.amount,
    createdAt: new Date(t.created * 1000).toISOString(),
    dashboardUrl: "https://dashboard.stripe.com/test/connect/transfers/" + t.id,
    sourceTransaction: typeof t.source_transaction === "string" ? t.source_transaction : (t.source_transaction?.id ?? null),
  };
}

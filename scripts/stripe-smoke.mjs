// Smoke test: which money-movement primitives work in this GB sandbox?
// Usage: STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-smoke.mjs
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY missing");
  process.exit(1);
}
const stripe = new Stripe(key);
const ok = (label, extra = "") => console.log(`✅ ${label} ${extra}`);
const bad = (label, e) => console.log(`❌ ${label}: ${e?.message ?? e}`);

const acct = await stripe.accounts.retrieve();
console.log(`account ${acct.id} country=${acct.country} currency=${acct.default_currency}`);

// 1. Charge with the "instantly available balance" test card
let pi;
try {
  pi = await stripe.paymentIntents.create({
    amount: 50000,
    currency: "gbp",
    payment_method: "pm_card_bypassPending",
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: { smoke: "1" },
  });
  ok("PaymentIntent (bypass pending)", pi.id + " " + pi.status);
} catch (e) {
  bad("PaymentIntent", e);
}

// 2. Refund
try {
  if (pi) {
    const r = await stripe.refunds.create({ payment_intent: pi.id, amount: 1000 });
    ok("Refund", r.id + " " + r.status);
  }
} catch (e) {
  bad("Refund", e);
}

// 3. Balance
try {
  const b = await stripe.balance.retrieve();
  ok("Balance", JSON.stringify(b.available));
} catch (e) {
  bad("Balance", e);
}

// 4. Connect: create a GB connected account and transfer to it
try {
  const ca = await stripe.accounts.create({
    country: "GB",
    controller: {
      stripe_dashboard: { type: "none" },
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: "application",
    },
    capabilities: { transfers: { requested: true } },
    business_type: "individual",
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "8.8.8.8", service_agreement: "recipient" },
    metadata: { smoke: "1" },
  });
  ok("Connected account", ca.id + " transfers=" + ca.capabilities?.transfers);
  const t = await stripe.transfers.create(
    { amount: 2500, currency: "gbp", destination: ca.id, metadata: { smoke: "1" } },
    { idempotencyKey: "smoke-transfer-" + Date.now() }
  );
  ok("Transfer", t.id);
} catch (e) {
  bad("Connect account/transfer", e);
}

// 5. Payout to a test GB bank account
try {
  const ext = await stripe.accounts.createExternalAccount(acct.id, {
    external_account: {
      object: "bank_account",
      country: "GB",
      currency: "gbp",
      account_number: "00012345",
      routing_number: "108800",
      account_holder_name: "Smoke Test",
    },
  }).catch(() => null);
  const p = await stripe.payouts.create({ amount: 1500, currency: "gbp", metadata: { smoke: "1" } });
  ok("Payout", p.id + " " + p.status + (ext ? " ext=" + ext.id : ""));
} catch (e) {
  bad("Payout", e);
}

// 6. Issuing
try {
  const ch = await stripe.issuing.cardholders.list({ limit: 1 });
  ok("Issuing reachable", `cardholders=${ch.data.length}`);
} catch (e) {
  bad("Issuing", e);
}

// 7. Invoice
try {
  const c = await stripe.customers.create({ name: "Smoke Co", email: "smoke@example.com" });
  await stripe.invoiceItems.create({ customer: c.id, amount: 12000, currency: "gbp", description: "smoke line" });
  const inv = await stripe.invoices.create({ customer: c.id, collection_method: "send_invoice", days_until_due: 7 });
  const fin = await stripe.invoices.finalizeInvoice(inv.id);
  ok("Invoice", fin.id + " " + fin.status + " " + fin.hosted_invoice_url);
} catch (e) {
  bad("Invoice", e);
}

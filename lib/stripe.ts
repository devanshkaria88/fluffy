import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("STRIPE_SECRET_KEY is not set (test-mode key required)");
if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
  throw new Error("Refusing to run with a non-test Stripe key");
}

export const stripe = new Stripe(key, { appInfo: { name: "stripe-briefcase-hackathon" } });

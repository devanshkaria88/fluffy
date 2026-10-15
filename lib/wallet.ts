// The freelancer's side of the ledger: Connect account balance + every transfer that landed there.
// Read-only, cached, never throws — the UI polls /api/state every 1.5s.
import { stripe } from "./stripe";
import type { Milestone, Wallet, WalletTransfer } from "./types";

const TTL = 8_000;
let cache: { at: number; acct: string; value: Wallet | null } = { at: 0, acct: "", value: null };

const gbpSum = (entries: { amount: number; currency: string }[]) =>
  entries.filter((e) => e.currency === "gbp").reduce((s, e) => s + e.amount, 0);

export async function walletSnapshot(milestones: Milestone[]): Promise<Wallet | null> {
  const m = milestones[0];
  const acct = m?.freelancerConnectedAccountId ?? process.env.STRIPE_FREELANCER_ACCOUNT_ID;
  if (!acct) return null;
  if (cache.acct === acct && Date.now() - cache.at < TTL) return cache.value;

  const [balance, transfers] = await Promise.all([
    stripe.balance
      .retrieve({}, { stripeAccount: acct })
      .then((b) => ({ availablePence: gbpSum(b.available), pendingPence: gbpSum(b.pending) }))
      .catch(() => null),
    stripe.transfers
      .list({ destination: acct, limit: 12 })
      .then((r) =>
        r.data
          .sort((a, b) => b.created - a.created)
          .map(
            (t): WalletTransfer => ({
              id: t.id,
              amountPence: t.amount,
              createdAt: new Date(t.created * 1000).toISOString(),
              description: t.description ?? "",
              milestoneId: t.metadata?.milestone_id ?? null,
              decisionId: t.metadata?.decision_id ?? null,
              prNumber: t.metadata?.pr ? Number(t.metadata.pr) : null,
              dashboardUrl: "https://dashboard.stripe.com/test/connect/transfers/" + t.id,
            }),
          ),
      )
      .catch(() => null),
  ]);

  // Both calls failed (bad key, network, account gone): keep whatever we last had.
  if (!balance && !transfers) return cache.acct === acct ? cache.value : null;

  const value: Wallet = {
    accountId: acct,
    login: m?.freelancerLogin ?? "",
    name: m?.freelancerName ?? "",
    availablePence: balance?.availablePence ?? null,
    pendingPence: balance?.pendingPence ?? null,
    transfers: transfers ?? cache.value?.transfers ?? [],
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), acct, value };
  return value;
}

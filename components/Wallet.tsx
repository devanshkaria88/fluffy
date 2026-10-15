"use client";
import { useEffect, useRef, useState } from "react";
import type { Milestone, Runtime, Wallet as WalletT, WalletTransfer } from "@/lib/types";
import { formatGBP } from "@/lib/types";
import { ago, shortId } from "./ui";

/** Short milestone label: "M1 — Invoice module" → "M1". */
function milestoneLabel(ms: Milestone[], id: string | null): string {
  if (!id) return "";
  const m = ms.find((x) => x.id === id);
  if (!m) return id;
  const head = m.title.split(/\s[—–-]\s/)[0]?.trim();
  return head && head.length <= 6 ? head : m.title;
}

/** While the wallet endpoint is not there yet, show what the runtime already knows about transfers. */
function transfersFromRuntime(rt: Runtime): WalletTransfer[] {
  return rt.decisions
    .filter((d) => d.stripe && (d.status === "paid" || d.status === "released_by_human"))
    .map((d) => ({
      id: d.stripe!.id,
      amountPence: d.stripe!.amountPence,
      createdAt: d.stripe!.createdAt,
      description: d.reason,
      milestoneId: d.milestoneId,
      decisionId: d.id,
      prNumber: d.prNumber,
      dashboardUrl: d.stripe!.dashboardUrl,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export default function Wallet({ wallet, runtime, login, now }: { wallet: WalletT | null | undefined; runtime: Runtime; login: string; now: number }) {
  const transfers = wallet ? wallet.transfers : transfersFromRuntime(runtime);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // One-shot highlight for rows that arrived since the previous poll.
  useEffect(() => {
    const ids = transfers.map((t) => t.id);
    if (!seen.current) { seen.current = new Set(ids); return; }
    const added = ids.filter((id) => !seen.current!.has(id));
    for (const id of ids) seen.current.add(id);
    if (added.length === 0) return;
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 1300);
    return () => clearTimeout(t);
  }, [transfers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const who = wallet?.login || login;
  return (
    <section className="border-t border-line px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="section-title">Freelancer wallet · <span className="normal-case tracking-normal">@{who}</span></div>
        {wallet?.accountId ? <span className="mono faint text-[11px]">{wallet.accountId}</span> : null}
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="card px-3 py-3">
          <div className="faint text-[11px] uppercase tracking-wide">Available</div>
          {wallet && wallet.availablePence != null ? (
            <div className="mono mt-1 text-[22px] font-semibold leading-none tracking-tight">{formatGBP(wallet.availablePence)}</div>
          ) : (
            <div className="muted pulse mt-1 text-[12px]">Connecting to Stripe…</div>
          )}
          <div className="muted mt-2 text-[11.5px]">
            pending <span className="mono">{wallet && wallet.pendingPence != null ? formatGBP(wallet.pendingPence) : "—"}</span>
          </div>
          {wallet?.fetchedAt ? <div className="faint mt-1 text-[11px]">updated {ago(wallet.fetchedAt, now)}</div> : null}
        </div>

        <div className="min-w-0">
          <div className="faint mb-1.5 text-[11px] uppercase tracking-wide">Incoming</div>
          {transfers.length === 0 ? (
            <div className="col-placeholder faint px-3 py-4 text-center text-[11.5px]">Nothing yet — Fluffy pays the moment every requirement is proven.</div>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {transfers.map((t) => (
                <li key={t.id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-[12px] ${fresh.has(t.id) ? "arrive" : ""}`}>
                  <span className="mono font-medium text-success">+{formatGBP(t.amountPence)}</span>
                  {t.milestoneId ? <><span className="faint">·</span><span className="muted">{milestoneLabel(runtime.milestones, t.milestoneId)}</span></> : null}
                  {t.prNumber != null ? <><span className="faint">·</span><span className="muted mono">PR #{t.prNumber}</span></> : null}
                  <span className="faint">·</span>
                  <a className="mono text-accent hover:underline" href={t.dashboardUrl} target="_blank" rel="noreferrer" title={t.id}>{shortId(t.id)}</a>
                  <span className="faint">·</span>
                  <span className="faint">{ago(t.createdAt, now)}</span>
                  {t.decisionId ? <span className="chip mono ml-auto" style={{ opacity: 0.6 }} title="Decision id — also the Stripe idempotency key"><span className="v">{t.decisionId}</span></span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

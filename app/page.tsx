"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Milestone, Wallet as WalletT } from "@/lib/types";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import DetailPanel from "@/components/DetailPanel";
import { MilestoneHeader, PRList } from "@/components/PRList";
import { Board, RequirementsStrip, ViewToggle, type View } from "@/components/Board";
import Wallet from "@/components/Wallet";
import { Markdown, Modal, PassIcon } from "@/components/ui";
import { moodFromState } from "@/components/Fluffy";
import { EMPTY_STATE, latestDecision, milestoneById, post, type AppState } from "@/components/state";

type EvalRow = { name: string; expected: string; actual: string; ok: boolean; citedClauses: string[] };
type Evals = { passed: number; total: number; results: EvalRow[] };

export default function Home() {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPR, setSelectedPR] = useState<number | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<"evals" | "policy" | null>(null);
  const [view, setView] = useState<View>("board");
  const [evals, setEvals] = useState<Evals | null>(null);
  const [policy, setPolicy] = useState<string>("");
  const [replayResult, setReplayResult] = useState<{ id: string; sameStripeId: boolean; stripeId: string | null } | null>(null);
  const [now, setNow] = useState(0);
  const [mountedAt, setMountedAt] = useState(0);

  const say = useCallback((t: string) => { setToast(t); setTimeout(() => setToast((x) => (x === t ? null : x)), 6000); }, []);

  // poll /api/state
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const s = (await res.json()) as AppState;
        if (!stop) { setState(s); setOffline(false); }
      } catch { if (!stop) setOffline(true); }
      if (!stop) { setNow(Date.now()); setMountedAt((x) => x || Date.now()); }
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => { stop = true; clearInterval(id); };
  }, []);

  const rt = state.runtime;
  const wallet = (state as AppState & { wallet?: WalletT | null }).wallet ?? null; // tolerate an older /api/state without it
  const selectedId = selected ?? rt.milestones[0]?.id ?? null;
  const m: Milestone | undefined = milestoneById(rt, selectedId);
  const prs = m ? state.prs[m.id] ?? [] : [];
  // Default to the most recently decided PR for this milestone, so the traceability panel is never empty.
  const defaultPR = m
    ? [...rt.decisions].filter((d) => d.milestoneId === m.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.prNumber ?? null
    : null;
  const effectivePR = selectedPR ?? defaultPR;
  const pr = m && effectivePR != null ? prs.find((p) => p.number === effectivePR) : undefined;
  const lastDecision = useMemo(() => (rt.activity ? latestDecision(rt, rt.activity.milestoneId, rt.activity.prNumber) : undefined), [rt]);
  const mood = moodFromState(rt.activity, lastDecision, now, mountedAt, pending.size > 0);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { say(`${key} failed: ${(e as Error).message}`); } finally { setBusy(null); }
  };
  const onSeed = () => run("seed", async () => { const r = await post<{ milestones: Milestone[] }>("/api/seed"); say(`Seeded ${r.milestones.length} milestone(s): escrow funded, account created, memory seeded.`); });
  const onReset = () => run("reset", async () => { await post("/api/reset"); setSelectedPR(null); setReplayResult(null); say("Runtime reset."); });
  const onVerify = (n: number) => {
    if (!m) return;
    setPending((p) => new Set(p).add(n));
    setSelectedPR(n);
    post<{ decision: { verdict: string; status: string } }>("/api/verify", { milestoneId: m.id, prNumber: n })
      .then((r) => say(`#${n}: ${r.decision.verdict} · ${r.decision.status}`))
      .catch((e) => say(`Verify #${n} failed: ${(e as Error).message}`))
      .finally(() => setPending((p) => { const s = new Set(p); s.delete(n); return s; }));
  };
  const onReplay = (id: string) => run("replay", async () => {
    const r = await post<{ sameStripeId: boolean; stripeId: string | null }>(`/api/replay/${id}`);
    setReplayResult({ id, ...r });
    say(r.sameStripeId ? `Replay returned the same Stripe id (${r.stripeId}). No double pay.` : `Replay returned a different id: ${r.stripeId}`);
  });
  const onDecide = async (id: string, action: "release" | "uphold_hold", by: string, note: string) => {
    try { const r = await post<{ decision: { status: string } }>(`/api/decisions/${id}`, { action, by, note }); say(`${action.replace("_", " ")} by ${by}: ${r.decision.status}`); }
    catch (e) { say(`Decision failed: ${(e as Error).message}`); }
  };
  const openEvals = async () => {
    setModal("evals"); setEvals(null);
    try { const res = await fetch("/api/evals", { cache: "no-store" }); setEvals((await res.json()) as Evals); } catch { setEvals({ passed: 0, total: 0, results: [] }); }
  };
  const openPolicy = async () => {
    setModal("policy");
    if (!policy) { try { const res = await fetch("/api/policy"); setPolicy(await res.text()); } catch { setPolicy("# Policy unavailable"); } }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar seeded={rt.seeded} busy={busy} offline={offline} onSeed={onSeed} onReset={onReset} onEvals={openEvals} onPolicy={openPolicy} toast={toast} />
      <div className="flex min-h-0 flex-1">
        <Sidebar state={state} mood={mood} selected={selectedId} onSelect={(id) => { setSelected(id); setSelectedPR(null); }} offline={offline} />
        <main className={`min-w-0 flex-1 overflow-auto ${pr ? "hidden md:block" : ""}`}>
          {m ? (
            <>
              <div className="relative">
                <MilestoneHeader m={m} prs={prs} />
                <div className="absolute right-5 top-4"><ViewToggle view={view} onChange={setView} /></div>
              </div>
              <RequirementsStrip state={state} m={m} />
              {view === "board" ? (
                <Board state={state} m={m} prs={prs} selectedPR={effectivePR} onSelect={(n) => setSelectedPR((cur) => (cur === n ? null : n))} onVerify={onVerify} onReplay={onReplay} pending={pending} now={now} />
              ) : (
                <PRList state={state} m={m} prs={prs} selectedPR={effectivePR} onSelect={(n) => setSelectedPR((cur) => (cur === n ? null : n))} onVerify={onVerify} onReplay={onReplay} pending={pending} now={now} />
              )}
              <Wallet wallet={wallet} runtime={rt} login={m.freelancerLogin} now={now} />
            </>
          ) : (
            <div className="faint flex h-full items-center justify-center text-[12px]">{offline ? "Waiting for /api/state…" : "No milestone selected."}</div>
          )}
        </main>
        {m && pr ? (
          <DetailPanel state={state} m={m} pr={pr} onClose={() => setSelectedPR(null)} onDecide={onDecide} onReplay={onReplay} replayResult={replayResult} now={now} />
        ) : null}
      </div>

      {modal === "evals" ? (
        <Modal title={evals ? `Evals · ${evals.passed}/${evals.total} passed` : "Evals"} onClose={() => setModal(null)} wide>
          {!evals ? <div className="faint pulse text-[12px]">Running the checker evals…</div> : evals.results.length === 0 ? <div className="faint text-[12px]">No eval results.</div> : (
            <table className="w-full text-[12px]">
              <thead><tr className="faint text-left text-[11px] uppercase tracking-wide"><th className="py-1 pr-2 font-medium">Case</th><th className="py-1 pr-2 font-medium">Expected</th><th className="py-1 pr-2 font-medium">Actual</th><th className="py-1 pr-2 font-medium">Clauses</th></tr></thead>
              <tbody>
                {evals.results.map((r) => (
                  <tr key={r.name} className="border-t border-line">
                    <td className="flex items-center gap-2 py-1.5 pr-2"><PassIcon ok={r.ok} />{r.name}</td>
                    <td className="mono py-1.5 pr-2">{r.expected}</td>
                    <td className={`mono py-1.5 pr-2 ${r.ok ? "" : "text-danger"}`}>{r.actual}</td>
                    <td className="mono muted py-1.5">{r.citedClauses.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      ) : null}
      {modal === "policy" ? (
        <Modal title="Escrow policy" onClose={() => setModal(null)} wide>
          {policy ? <Markdown text={policy} /> : <div className="faint pulse text-[12px]">Loading…</div>}
        </Modal>
      ) : null}
    </div>
  );
}

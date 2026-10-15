"use client";
import { useState } from "react";
import type { Decision, Milestone, PullRequestRef, RequirementVerdict, Verification } from "@/lib/types";
import { formatGBP } from "@/lib/types";
import { FluffyDot } from "./Fluffy";
import { Chip, PassIcon, Status, StatusIcon, sha7, statusOf, when } from "./ui";
import { isRunning, latestDecision, latestVerification, verificationFor, type AppState } from "./state";

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="section-title">{title}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2 py-0.5 text-[12px]">
      <span className="faint">{k}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="text-accent hover:underline" href={href} target="_blank" rel="noreferrer">{children}</a>;
}

function VerdictLine({ label, v }: { label: string; v: RequirementVerdict | undefined }) {
  if (!v) return <div className="faint text-[12px]">{label}: no verdict</div>;
  return (
    <div className="text-[12px]">
      <div className="flex items-center gap-1.5">
        <span className="faint w-16">{label}</span>
        <PassIcon ok={v.met} />
        <span className={v.met ? "text-success" : "text-warning"}>{v.met ? "met" : "not met"}</span>
        {v.note ? <span className="muted truncate" title={v.note}>· {v.note}</span> : null}
      </div>
      {v.evidence?.length ? (
        <ul className="ml-[70px] mt-0.5 space-y-0.5">
          {v.evidence.map((e, i) => (
            <li key={i} className="muted"><span className="chip mono mr-1 !h-[16px] !px-1.5 !text-[10px]">{e.kind}</span><span className="mono">{e.ref}</span>{e.detail ? <span className="faint"> — {e.detail}</span> : null}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function DetailPanel({ state, m, pr, onClose, onDecide, onReplay, replayResult, now }: {
  state: AppState; m: Milestone; pr: PullRequestRef; onClose: () => void;
  onDecide: (id: string, action: "release" | "uphold_hold", by: string, note: string) => Promise<void>;
  onReplay: (id: string) => void; replayResult: { id: string; sameStripeId: boolean; stripeId: string | null } | null; now: number;
}) {
  const rt = state.runtime;
  const d: Decision | undefined = latestDecision(rt, m.id, pr.number);
  const v: Verification | undefined = verificationFor(rt, d) ?? latestVerification(rt, m.id, pr.number);
  const running = isRunning(rt, m.id, pr.number);
  const [by, setBy] = useState("Priya Shah");
  const [note, setNote] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [showOut, setShowOut] = useState(false);
  const act = rt.activity && rt.activity.milestoneId === m.id && rt.activity.prNumber === pr.number ? rt.activity : null;
  const isHold = d && (d.status === "held" || d.status === "disputed");
  void now;

  const decide = async (action: "release" | "uphold_hold") => {
    if (!d) return;
    setActing(action);
    try { await onDecide(d.id, action, by, note); setNote(""); } finally { setActing(null); }
  };

  return (
    <aside className="flex h-full w-full flex-col border-l border-line bg-panel md:w-[420px] md:flex-none">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Status status={statusOf(d, running)} />
        <span className="mono muted">#{pr.number}</span>
        <span className="min-w-0 flex-1 truncate font-medium" title={pr.title}>{pr.title}</span>
        <Ext href={pr.url}>GitHub</Ext>
        <button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
        <Chip k="author">@{pr.authorLogin}</Chip>
        <Chip k="sha" mono>{sha7(pr.headSha)}</Chip>
        <Chip k="base" mono>{pr.headRef} → {pr.baseRef}</Chip>
        <Chip mono>+{pr.additions} −{pr.deletions} · {pr.changedFiles} files</Chip>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {running && act ? (
          <div className="flex items-center gap-2 border-b border-line bg-panel-2 px-4 py-2 text-[12px]">
            <FluffyDot size={16} /><span className="pulse">{act.stage} · {act.detail}</span>
          </div>
        ) : null}

        {!d && !v ? (
          <div className="faint px-4 py-8 text-center text-[12px]">{running ? "Fluffy is on it. The report lands here." : "Not verified yet. Press Verify."}</div>
        ) : null}

        {d ? (
          <Section title="Decision" right={<span className={`mono text-[11px] ${d.verdict === "PAY" ? "text-success" : "text-warning"}`}>{d.verdict}</span>}>
            <KV k="id"><span className="mono">{d.id}</span></KV>
            <KV k="verdict"><span className={d.verdict === "PAY" ? "text-success" : "text-warning"}>{d.verdict}</span> <span className="faint">· {d.status}</span></KV>
            <KV k="reason">{d.reason}</KV>
            <KV k="clauses"><span className="flex flex-wrap gap-1">{d.citedClauses.map((c) => <Chip key={c} mono>{c}</Chip>)}</span></KV>
            <KV k="policy"><span className="mono">{d.policyVersion}</span></KV>
            {d.stripe ? (
              <KV k="stripe">
                <Ext href={d.stripe.dashboardUrl}><span className="mono">{d.stripe.id}</span></Ext>
                <span className="faint"> · {d.stripe.object === "payout" ? "payout (Connect fallback)" : d.stripe.object} · {formatGBP(d.stripe.amountPence)}{d.stripe.sourceTransaction ? ` · src ${d.stripe.sourceTransaction}` : ""}</span>
              </KV>
            ) : null}
            {d.githubCommentUrl ? <KV k="comment"><Ext href={d.githubCommentUrl}>PR comment</Ext></KV> : null}
            {d.human ? <KV k="human">{d.human.action.replace("_", " ")} by {d.human.by} <span className="faint">· {when(d.human.at)}</span>{d.human.note ? <div className="muted">“{d.human.note}”</div> : null}</KV> : null}
            {d.error ? <KV k="error"><span className="text-danger">{d.error}</span></KV> : null}
            {replayResult && replayResult.id === d.id ? (
              <KV k="replay"><span className={replayResult.sameStripeId ? "text-success" : "text-danger"}>{replayResult.sameStripeId ? "same Stripe id — no double pay" : "different Stripe id!"}</span> <span className="mono faint">{replayResult.stripeId ?? "null"}</span></KV>
            ) : null}
            {(d.status === "paid" || d.status === "released_by_human") ? (
              <div className="mt-2"><button className="btn sm" onClick={() => onReplay(d.id)}>Replay release (§6)</button></div>
            ) : null}
            {isHold ? (
              <div className="mt-3 rounded-md border border-line-2 bg-panel-2 p-3">
                <div className="mb-2 text-[12px] font-medium">Human review (§7)</div>
                <div className="flex gap-2">
                  <input className="input w-[130px]" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Reviewer" />
                  <input className="input flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (recorded in memory)" />
                </div>
                <div className="mt-2 flex gap-2">
                  <button className="btn sm primary" disabled={!!acting || !by.trim()} onClick={() => decide("release")}>{acting === "release" ? "Releasing…" : "Release"}</button>
                  <button className="btn sm" disabled={!!acting || !by.trim()} onClick={() => decide("uphold_hold")}>{acting === "uphold_hold" ? "Saving…" : "Uphold hold"}</button>
                </div>
              </div>
            ) : null}
          </Section>
        ) : null}

        {d ? (
          <Section title="Policy checks">
            <table className="w-full text-[12px]">
              <tbody>
                {d.checks.map((c) => (
                  <tr key={c.clause} className="border-t border-line align-top first:border-t-0">
                    <td className="mono w-8 py-1 faint">{c.clause}</td>
                    <td className="w-5 py-1"><PassIcon ok={c.passed} /></td>
                    <td className="py-1 pr-2 font-medium">{c.title}</td>
                    <td className="muted py-1">{c.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        ) : null}

        {v ? (
          <Section title="Requirements" right={<span className="mono text-[11px] muted">{v.requirementsMet}/{v.requirementsTotal} met{v.agreed ? "" : ` · disagree on ${v.disagreements.join(", ")}`}</span>}>
            <div className="space-y-2.5">
              {m.requirements.map((r) => {
                const fin = v.crossChecked.find((x) => x.id === r.id);
                const A = v.reports.find((x) => x.verifier === "A")?.verdicts.find((x) => x.id === r.id);
                const B = v.reports.find((x) => x.verifier === "B")?.verdicts.find((x) => x.id === r.id);
                return (
                  <div key={r.id} className="rounded-md border border-line p-2">
                    <div className="flex items-start gap-2">
                      <StatusIcon status={fin ? (fin.met ? "paid" : "held") : "none"} />
                      <span className="mono faint">{r.id}</span>
                      <span className="min-w-0 flex-1 text-[12px]">{r.text}{!r.testable ? <span className="faint"> (not testable)</span> : null}</span>
                    </div>
                    <div className="mt-1.5 space-y-1 border-t border-line pt-1.5">
                      <VerdictLine label={`A · ${v.reports[0]?.framing ?? ""}`.slice(0, 22)} v={A} />
                      <VerdictLine label={`B · ${v.reports[1]?.framing ?? ""}`.slice(0, 22)} v={B} />
                      {fin?.note ? <div className="text-[12px]"><span className="faint w-16 inline-block">cross</span><span className="muted">{fin.note}</span></div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {v.reports.map((r) => (
              <div key={r.verifier} className="muted mt-2 text-[12px]"><span className="faint">Verifier {r.verifier} ({r.framing}, {r.model}):</span> {r.summary}</div>
            ))}
          </Section>
        ) : null}

        {v ? (
          <Section title="Tests" right={<span className="mono text-[11px]"><span className={v.testRun.ok ? "text-success" : "text-danger"}>{v.testRun.passed} passed</span>{v.testRun.failed ? <span className="text-danger"> · {v.testRun.failed} failed</span> : null}{v.testRun.skipped ? <span className="faint"> · {v.testRun.skipped} skipped</span> : null}<span className="faint"> · {v.testRun.total} total</span></span>}>
            <KV k="command"><span className="mono">{v.testRun.command}</span></KV>
            <KV k="base total"><span className="mono">{v.testRun.baseTotal ?? "unknown"}</span> <span className="faint">(§3 no shrink)</span></KV>
            <KV k="duration"><span className="mono">{(v.testRun.durationMs / 1000).toFixed(1)}s</span></KV>
            {v.testRun.tests.filter((t) => t.status === "failed").map((t) => (
              <div key={t.name} className="mt-1 rounded-md border border-danger/40 bg-danger/5 p-2 text-[12px]">
                <div className="mono text-danger">{t.name}</div>
                <div className="faint mono text-[11px]">{t.file}</div>
                {t.message ? <pre className="mono mt-1 whitespace-pre-wrap text-[11px] muted">{t.message}</pre> : null}
              </div>
            ))}
            <button className="btn ghost sm mt-2" onClick={() => setShowOut((s) => !s)}>{showOut ? "Hide" : "Show"} stdout tail</button>
            {showOut ? <pre className="mono mt-1 max-h-60 overflow-auto rounded-md border border-line bg-bg p-2 text-[11px] muted whitespace-pre-wrap">{v.testRun.stdoutTail || "(empty)"}</pre> : null}
          </Section>
        ) : null}

        {v ? (
          <Section title="Memory used">
            {v.memoryUsed.length === 0 ? <div className="faint text-[12px]">No prior facts.</div> : (
              <ul className="space-y-1">
                {v.memoryUsed.map((f, i) => (
                  <li key={i} className="flex gap-2 text-[12px]"><span className={`chip !h-[16px] !px-1.5 !text-[10px] ${f.source === "cognee" ? "text-accent" : ""}`}>{f.source}</span><span className="muted">“{f.text}”</span></li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {d ? (
          <Section title="Timeline">
            <ol className="space-y-1">
              {d.timeline.map((t, i) => (
                <li key={i} className="flex gap-2 text-[12px]">
                  <FluffyDot size={14} className="mt-0.5" />
                  <span className="mono faint w-[62px] flex-none">{when(t.at)}</span>
                  <span className="min-w-0 break-words">{t.event}</span>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}
      </div>
    </aside>
  );
}

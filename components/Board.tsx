"use client";
import type { Decision, Milestone, PullRequestRef, Verification } from "@/lib/types";
import { formatGBP } from "@/lib/types";
import { FluffyDot } from "./Fluffy";
import { StatusIcon, ago, sha7, shortId, statusOf } from "./ui";
import { isRunning, latestDecision, latestVerification, verificationFor, type AppState } from "./state";

export type View = "board" | "list";

/** "Board | List" segmented control. */
export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="seg" role="tablist" aria-label="View">
      {(["board", "list"] as View[]).map((v) => (
        <button key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => onChange(v)}>
          {v === "board" ? "Board" : "List"}
        </button>
      ))}
    </div>
  );
}

/** One chip per requirement, coloured by the latest decision for the milestone. */
export function RequirementsStrip({ state, m }: { state: AppState; m: Milestone }) {
  const rt = state.runtime;
  const d = latestDecision(rt, m.id);
  const v = verificationFor(rt, d);
  const met = new Map<string, boolean>();
  for (const c of v?.crossChecked ?? []) met.set(c.id, c.met);
  return (
    <div className="border-b border-line px-5 py-3">
      <div className="muted text-[12px]">Fluffy verifies every PR against this milestone. Money moves only when every requirement is proven.</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {m.requirements.map((r) => {
          const s = met.get(r.id);
          const color = s === true ? "var(--success)" : s === false ? "var(--warning)" : "var(--text-3)";
          return (
            <span key={r.id} className="chip req" title={r.text} style={{ color: s === undefined ? undefined : "var(--text)" }}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                {s === true ? <path d="m2.3 5.2 1.9 1.9 3.6-3.9" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  : s === false ? <path d="M2.4 5h5.2" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
                  : <circle cx="5" cy="5" r="2.4" fill={color} />}
              </svg>
              <span className="v mono">{r.id}</span>
            </span>
          );
        })}
        <span className="faint ml-1 text-[11px]">
          {v ? `Requirements proven by the latest verification · ${v.requirementsMet}/${v.requirementsTotal} met` : "Requirements proven by the latest verification · not verified yet"}
        </span>
      </div>
    </div>
  );
}

type ColumnKey = "submitted" | "verifying" | "held" | "paid";
const COLUMNS: { key: ColumnKey; title: string; hint: string }[] = [
  { key: "submitted", title: "Submitted", hint: "Open a PR against main" },
  { key: "verifying", title: "Verifying", hint: "Press Verify on a PR" },
  { key: "held", title: "Held — needs work", hint: "Nothing waiting on the freelancer" },
  { key: "paid", title: "Paid", hint: "Paid the moment every requirement is proven" },
];

function columnOf(d: Decision | undefined, running: boolean): ColumnKey {
  if (running) return "verifying";
  if (!d) return "submitted";
  if (d.status === "paid" || d.status === "released_by_human") return "paid";
  return "held";
}

export function Board({ state, m, prs, selectedPR, onSelect, onVerify, onReplay, pending, now }: {
  state: AppState; m: Milestone; prs: PullRequestRef[]; selectedPR: number | null;
  onSelect: (n: number) => void; onVerify: (n: number) => void; onReplay: (decisionId: string) => void;
  pending: Set<number>; now: number;
}) {
  const rt = state.runtime;
  const rows = prs.map((pr) => {
    const running = isRunning(rt, m.id, pr.number) || pending.has(pr.number);
    const d = latestDecision(rt, m.id, pr.number);
    const v = latestVerification(rt, m.id, pr.number);
    return { pr, running, d, v, col: columnOf(d, running) };
  });
  return (
    <div className="@container"><div className="grid grid-cols-2 gap-3 px-5 py-4 @3xl:grid-cols-4">
      {COLUMNS.map((c) => {
        const cards = rows.filter((r) => r.col === c.key);
        return (
          <section key={c.key} className="min-w-0">
            <header className="mb-2 flex items-center gap-2">
              <span className="section-title">{c.title}</span>
              <span className="pill">{cards.length}</span>
            </header>
            <div className="flex flex-col gap-2">
              {cards.length === 0 ? (
                <div className="col-placeholder faint px-3 py-5 text-center text-[11.5px]">{c.hint}</div>
              ) : cards.map(({ pr, running, d, v }) => (
                <Card key={pr.number} m={m} pr={pr} d={d} v={v} running={running} active={selectedPR === pr.number}
                  activity={rt.activity && rt.activity.milestoneId === m.id && rt.activity.prNumber === pr.number ? rt.activity : null}
                  now={now} onSelect={onSelect} onVerify={onVerify} onReplay={onReplay} />
              ))}
            </div>
          </section>
        );
      })}
    </div></div>
  );
}

function Card({ m, pr, d, v, running, active, activity, now, onSelect, onVerify, onReplay }: {
  m: Milestone; pr: PullRequestRef; d: Decision | undefined; v: Verification | undefined; running: boolean; active: boolean;
  activity: AppState["runtime"]["activity"]; now: number;
  onSelect: (n: number) => void; onVerify: (n: number) => void; onReplay: (decisionId: string) => void;
}) {
  const st = statusOf(d, running);
  const paid = st === "paid";
  const lastEvent = d?.timeline?.[d.timeline.length - 1];
  const reqPct = v && v.requirementsTotal ? Math.round((v.requirementsMet / v.requirementsTotal) * 100) : 0;
  const reqDone = !!v && v.requirementsMet === v.requirementsTotal;
  return (
    <div role="button" tabIndex={0} onClick={() => onSelect(pr.number)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(pr.number); }}
      className={`card cursor-pointer px-3 py-2.5 ${active ? "active" : ""}`}>
      <div className="flex items-start gap-2">
        <span className="mt-[2px]"><StatusIcon status={st} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="mono muted flex-none text-[12px]">#{pr.number}</span>
            <span className="line-clamp-2 text-[12.5px] leading-snug" title={pr.title}>{pr.title}</span>
          </div>
          <div className="muted mt-0.5 truncate text-[11.5px]">@{pr.authorLogin} <span className="faint">·</span> <span className="mono">{sha7(pr.headSha)}</span></div>
        </div>
      </div>

      {running && activity ? (
        <div className="muted mt-2 flex items-center gap-1.5 text-[11.5px]"><FluffyDot size={14} /><span className="pulse truncate">{activity.stage}: {activity.detail}</span></div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="chip mono" title="Tests passed / total on the PR head">
          <span className="k">tests</span>
          <span className="v">{v ? <><span className={v.testRun.failed ? "text-danger" : "text-success"}>{v.testRun.passed}</span><span className="faint">/{v.testRun.total}</span></> : <span className="faint">—</span>}</span>
        </span>
        <span className="chip mono" title="Requirements proven / total">
          <span className="k">reqs</span>
          <span className="v">{v ? <><span className={reqDone ? "text-success" : "text-warning"}>{v.requirementsMet}</span><span className="faint">/{v.requirementsTotal}</span></> : <span className="faint">—</span>}</span>
        </span>
        {paid && d?.stripe ? (
          <span className="chip mono" title={d.stripe.id}>
            <span className="v"><span className="text-success">{formatGBP(d.stripe.amountPence)}</span><span className="faint"> · {shortId(d.stripe.id)}</span></span>
          </span>
        ) : paid && d ? (
          <span className="chip mono"><span className="v text-success">{formatGBP(m.amountPence)}</span></span>
        ) : null}
      </div>
      <div className="bar mt-1.5" aria-hidden="true"><i style={{ width: `${reqPct}%`, background: reqDone ? "var(--success)" : "var(--warning)" }} /></div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="faint min-w-0 truncate text-[11px]" title={lastEvent?.event}>
          {lastEvent ? <>{ago(lastEvent.at, now)} <span className="muted">· {lastEvent.event}</span></> : d ? "" : "Not verified yet"}
        </span>
        <span className="flex flex-none items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {paid && d ? <button className="btn sm" onClick={() => onReplay(d.id)} title="Re-run the decision: same id, same Stripe transfer, no double pay">Replay</button> : null}
          {!paid ? (
            <button className="btn sm primary" disabled={running || !m.escrow} onClick={() => onVerify(pr.number)} title={!m.escrow ? "Fund escrow first (Seed)" : undefined}>
              {running ? "Verifying…" : "Verify"}
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}

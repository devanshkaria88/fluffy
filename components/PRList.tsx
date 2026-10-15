"use client";
import type { Milestone, PullRequestRef } from "@/lib/types";
import { formatGBP } from "@/lib/types";
import { FluffyDot } from "./Fluffy";
import { Chip, StatusIcon, ago, sha7, statusOf } from "./ui";
import { isRunning, latestDecision, latestVerification, type AppState } from "./state";

export function MilestoneHeader({ m, prs }: { m: Milestone; prs: PullRequestRef[] }) {
  const e = m.escrow;
  return (
    <div className="border-b border-line px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[15px] font-semibold">{m.title}</h1>
        <span className="muted">{m.clientName}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip k="amount" mono>{formatGBP(m.amountPence)}</Chip>
        <Chip k="escrow" mono>
          {e ? (
            <>
              <span className={e.status === "funded" ? "text-success" : e.status === "released" ? "text-accent" : "text-warning"}>{e.status}</span>
              <span className="faint">·</span>{e.paymentIntentId}
            </>
          ) : <span className="text-warning">not funded</span>}
        </Chip>
        <Chip k="freelancer">@{m.freelancerLogin}</Chip>
        <Chip k="repo" mono>{m.repo} · {m.baseBranch}</Chip>
        <Chip k="requirements">{m.requirements.length}</Chip>
        <Chip k="PRs">{prs.length}</Chip>
        {m.freelancerConnectedAccountId ? <Chip k="connect" mono>{m.freelancerConnectedAccountId}</Chip> : null}
      </div>
    </div>
  );
}

export function PRList({ state, m, prs, selectedPR, onSelect, onVerify, onReplay, pending, now }: {
  state: AppState; m: Milestone; prs: PullRequestRef[]; selectedPR: number | null;
  onSelect: (n: number) => void; onVerify: (n: number) => void; onReplay: (decisionId: string) => void;
  pending: Set<number>; now: number;
}) {
  const rt = state.runtime;
  if (prs.length === 0) {
    return <div className="faint px-5 py-8 text-center text-[12px]">No open pull requests on <span className="mono">{m.repo}</span>.</div>;
  }
  return (
    <div>
      <div className="grid grid-cols-[18px_52px_minmax(160px,1fr)_110px_64px_84px_72px_110px_minmax(120px,1fr)_auto] items-center gap-3 border-b border-line px-5 py-1.5 text-[11px] uppercase tracking-wide faint">
        <span /><span>PR</span><span>Title</span><span>Author</span><span>SHA</span><span>Tests</span><span>Reqs</span><span>Decision</span><span>Last activity</span><span />
      </div>
      {prs.map((pr) => {
        const running = isRunning(rt, m.id, pr.number) || pending.has(pr.number);
        const d = latestDecision(rt, m.id, pr.number);
        const v = latestVerification(rt, m.id, pr.number);
        const st = statusOf(d, running);
        const act = rt.activity && rt.activity.milestoneId === m.id && rt.activity.prNumber === pr.number ? rt.activity : null;
        const lastEvent = d?.timeline?.[d.timeline.length - 1];
        const canReplay = d && (d.status === "paid" || d.status === "released_by_human");
        return (
          <div key={pr.number} role="button" tabIndex={0} onClick={() => onSelect(pr.number)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(pr.number); }}
            className={`row grid cursor-pointer grid-cols-[18px_52px_minmax(160px,1fr)_110px_64px_84px_72px_110px_minmax(120px,1fr)_auto] items-center gap-3 border-b border-line px-5 py-2 ${selectedPR === pr.number ? "active" : ""}`}>
            <StatusIcon status={st} />
            <span className="mono muted">#{pr.number}</span>
            <span className="truncate" title={pr.title}>{pr.title}</span>
            <span className="muted truncate">@{pr.authorLogin}</span>
            <span className="mono faint">{sha7(pr.headSha)}</span>
            <span className="mono text-[12px]">
              {v ? <><span className={v.testRun.failed ? "text-danger" : "text-success"}>{v.testRun.passed}</span><span className="faint">/{v.testRun.total}</span></> : <span className="faint">—</span>}
            </span>
            <span className="mono text-[12px]">
              {v ? <><span className={v.requirementsMet === v.requirementsTotal ? "text-success" : "text-warning"}>{v.requirementsMet}</span><span className="faint">/{v.requirementsTotal}</span></> : <span className="faint">—</span>}
            </span>
            <span className="truncate text-[12px]">
              {d ? <><span className={d.verdict === "PAY" ? "text-success" : "text-warning"}>{d.verdict}</span> <span className="faint">· {d.status}</span></> : <span className="faint">—</span>}
            </span>
            <span className="muted flex min-w-0 items-center gap-1.5 truncate text-[12px]">
              {act && running ? (
                <><FluffyDot size={14} /><span className="pulse truncate">{act.stage}: {act.detail}</span></>
              ) : lastEvent ? (
                <span className="truncate" title={lastEvent.event}><span className="faint">{ago(lastEvent.at, now)}</span> · {lastEvent.event}</span>
              ) : <span className="faint">—</span>}
            </span>
            <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {canReplay ? <button className="btn sm" onClick={() => onReplay(d!.id)}>Replay</button> : null}
              <button className="btn sm primary" disabled={running || !m.escrow} onClick={() => onVerify(pr.number)} title={!m.escrow ? "Fund escrow first (Seed)" : undefined}>
                {running ? "Verifying…" : "Verify"}
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

"use client";
import Fluffy, { FluffyCaption, FluffyDot, type Mood } from "./Fluffy";
import { StatusIcon, statusOf } from "./ui";
import { latestDecision, type AppState } from "./state";
import { formatGBP } from "@/lib/types";

export default function Sidebar({ state, mood, selected, onSelect, offline }: {
  state: AppState; mood: Mood; selected: string | null; onSelect: (id: string) => void; offline: boolean;
}) {
  const { runtime: rt, agent } = state;
  const a = rt.activity;
  const live = a && a.stage !== "done" && a.stage !== "error";
  return (
    <aside className="flex h-full w-[240px] flex-none flex-col border-r border-line bg-panel">
      <div className="flex flex-col items-center gap-1 px-4 pt-5 pb-3">
        <Fluffy mood={mood} size={88} />
        <div className="mt-1 text-[13px] font-semibold">{agent.name}</div>
        <div className="faint text-center text-[12px]"><FluffyCaption mood={mood} activity={a} /></div>
      </div>

      <div className="hair mx-3" />

      <div className="px-3 pt-3">
        <div className="section-title mb-1.5 px-1">Milestones</div>
        {rt.milestones.length === 0 ? (
          <div className="faint px-1 py-2 text-[12px]">{offline ? "API offline — start the dev server." : "No milestones. Press Seed."}</div>
        ) : rt.milestones.map((m) => {
          const d = latestDecision(rt, m.id);
          const running = !!a && a.milestoneId === m.id && a.stage !== "done" && a.stage !== "error";
          return (
            <button key={m.id} onClick={() => onSelect(m.id)} className={`row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${selected === m.id ? "active" : ""}`}>
              <StatusIcon status={statusOf(d, running)} />
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              <span className="mono faint text-[11px]">{formatGBP(m.amountPence)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 px-4">
        <div className="section-title mb-1">Fluffy is…</div>
        <div className={`flex items-start gap-1.5 text-[12px] ${live ? "" : "faint"}`}>
          <FluffyDot size={14} className="mt-0.5" />
          <span className={live ? "pulse" : ""}>
            {a ? <>{a.stage} <span className="muted">· {a.detail}</span></> : "idle"}
          </span>
        </div>
      </div>

    </aside>
  );
}

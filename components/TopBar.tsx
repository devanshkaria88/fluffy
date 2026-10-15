"use client";
import { FluffyDot } from "./Fluffy";
import ThemeToggle from "./ThemeToggle";

export default function TopBar({ seeded, busy, offline, onSeed, onReset, onEvals, onPolicy, toast }: {
  seeded: boolean; busy: string | null; offline: boolean;
  onSeed: () => void; onReset: () => void; onEvals: () => void; onPolicy: () => void; toast: string | null;
}) {
  return (
    <header className="flex h-11 flex-none items-center gap-2 border-b border-line bg-panel px-4">
      <FluffyDot size={16} />
      <span className="font-semibold">Fluffy</span>
      <span className="faint">· escrow for freelance developers</span>
      {offline ? <span className="chip ml-2 text-warning">API offline</span> : null}
      {toast ? <span className="chip ml-2 max-w-[420px] truncate" title={toast}>{toast}</span> : null}
      <div className="ml-auto flex items-center gap-1.5">
        <button className="btn ghost" onClick={onPolicy}>Policy</button>
        <button className="btn ghost" onClick={onEvals}>Evals</button>
        <ThemeToggle />
        <span className="mx-1 h-4 w-px bg-line-2" />
        <button className="btn danger" onClick={onReset} disabled={busy === "reset"}>{busy === "reset" ? "Resetting…" : "Reset"}</button>
        <button className={`btn ${seeded ? "" : "primary"}`} onClick={onSeed} disabled={busy === "seed"}>{busy === "seed" ? "Seeding…" : seeded ? "Re-seed" : "Seed"}</button>
      </div>
    </header>
  );
}

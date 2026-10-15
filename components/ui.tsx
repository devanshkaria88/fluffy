"use client";
import { useEffect } from "react";
import type { Decision, DecisionStatus } from "@/lib/types";

export type RowStatus = "none" | "running" | "paid" | "held" | "failed";

export function statusOf(decision: Decision | undefined, running: boolean): RowStatus {
  if (running) return "running";
  if (!decision) return "none";
  const s: DecisionStatus = decision.status;
  if (s === "paid" || s === "released_by_human") return "paid";
  if (s === "held" || s === "disputed") return "held";
  return "failed";
}

export const STATUS_LABEL: Record<RowStatus, string> = {
  none: "Not verified",
  running: "Verifying",
  paid: "Paid",
  held: "Held",
  failed: "Failed",
};

/** Linear-style status icon: ring / half / check / minus / x. */
export function StatusIcon({ status, size = 14 }: { status: RowStatus; size?: number }) {
  const c = { none: "var(--text-3)", running: "var(--warning)", paid: "var(--success)", held: "var(--warning)", failed: "var(--danger)" }[status];
  let body = `<circle cx="7" cy="7" r="5.5" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="2.1 1.9"/>`;
  if (status === "running") body = `<circle cx="7" cy="7" r="5.5" fill="none" stroke="${c}" stroke-width="1.5"/><path d="M7 7V2.6A4.4 4.4 0 0 1 7 11.4z" fill="${c}"/>`;
  // The glyph is drawn in the page background colour so it reads as a cut-out in both themes.
  if (status === "paid") body = `<circle cx="7" cy="7" r="6.3" fill="${c}"/><path d="m4.4 7.2 1.8 1.8 3.5-3.7" fill="none" stroke="var(--bg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (status === "held") body = `<circle cx="7" cy="7" r="6.3" fill="${c}"/><path d="M4.3 7h5.4" stroke="var(--bg)" stroke-width="1.6" stroke-linecap="round"/>`;
  if (status === "failed") body = `<circle cx="7" cy="7" r="6.3" fill="${c}"/><path d="m4.8 4.8 4.4 4.4M9.2 4.8 4.8 9.2" stroke="var(--bg)" stroke-width="1.5" stroke-linecap="round"/>`;
  return (
    <span className="inline-flex flex-none items-center" title={STATUS_LABEL[status]}>
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" className={status === "running" ? "spin" : ""} dangerouslySetInnerHTML={{ __html: body }} />
    </span>
  );
}

export function Status({ status }: { status: RowStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <StatusIcon status={status} />
      <span className={status === "none" ? "faint" : ""}>{STATUS_LABEL[status]}</span>
    </span>
  );
}

export function PassIcon({ ok }: { ok: boolean }) {
  return <StatusIcon status={ok ? "paid" : "failed"} size={13} />;
}

export function Chip({ k, children, mono = false }: { k?: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <span className={`chip ${mono ? "mono" : ""}`}>
      {k ? <span className="k">{k}</span> : null}
      <span className="v">{children}</span>
    </span>
  );
}

export const sha7 = (s: string | undefined) => (s || "").slice(0, 7);
export const short = (s: string, n = 18) => (s.length > n ? s.slice(0, n) + "…" : s);
/** "tr_3UQttz6YRYM7Lp5g0uzUk932" → "tr_3UQt…k932" */
export const shortId = (s: string | undefined, head = 7, tail = 4) => (!s ? "" : s.length > head + tail + 1 ? s.slice(0, head) + "…" + s.slice(-tail) : s);
export const when = (iso: string | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
export const ago = (iso: string | undefined, now = Date.now()) => {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-6 pt-[8vh]" onMouseDown={onClose}>
      <div className={`popover w-full ${wide ? "max-w-3xl" : "max-w-xl"} max-h-[80vh] overflow-auto rounded-md border border-line-2 bg-panel`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-4 py-2.5">
          <div className="font-medium">{title}</div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">Esc</button>
        </div>
        <div className="px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

/** Tiny markdown: headings, paragraphs, bullets, **bold**. */
export function Markdown({ text }: { text: string }) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, '<code class="mono">$1</code>');
  const out: string[] = [];
  let para: string[] = [], list: string[] = [];
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; }
    if (list.length) { out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`); list = []; }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^\s*[-*]\s+/.test(line)) { if (para.length) flush(); list.push(line.replace(/^\s*[-*]\s+/, "")); continue; }
    if (!line.trim()) { flush(); continue; }
    if (list.length) flush();
    para.push(line.trim());
  }
  flush();
  return <div className="md" dangerouslySetInnerHTML={{ __html: out.join("") }} />;
}

// Briques du poste de travail : panneaux, en-têtes, bascules ambre, boutons de préréglage.

import type { ReactNode } from "react";

export function Panel({ title, tools, children, className = "" }: { title: string; tools?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-h-0 flex-col rounded-[3px] border border-line bg-panel ${className}`}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-line px-3">
        <h2 className="label truncate">{title}</h2>
        {tools && <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">{tools}</div>}
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 whitespace-nowrap rounded-[3px] border px-2 py-[3px] text-[11px] transition ${
        on ? "border-amber/80 bg-amber/10 text-amber" : "border-transparent text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`min-w-14 rounded-[3px] border px-3 py-1 text-[11px] transition ${
            value === v ? "border-line-strong bg-panel-2 text-amber" : "border-line text-ink-2 hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Preset({ title, sub, active, onClick }: { title: string; sub: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[3px] border px-2 py-1.5 text-left transition ${
        active ? "border-amber/70 bg-amber/10" : "border-line bg-panel-2/60 hover:border-line-strong"
      }`}
    >
      <span className={`block text-[11px] ${active ? "text-amber" : "text-ink"}`}>{title}</span>
      <span className="num block text-[9px] uppercase tracking-wider text-ink-3">{sub}</span>
    </button>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="label mb-2 mt-4 first:mt-0">{children}</p>;
}

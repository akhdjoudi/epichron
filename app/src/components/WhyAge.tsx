"use client";

import { useMemo, useState } from "react";
import { expectedBeta, explainAge, fmt1, type Sample, type Weights } from "@/lib/clock";

const TOP = 7;

function signed(v: number) {
  return `${v >= 0 ? "+" : "−"}${fmt1.format(Math.abs(v))}`;
}

/** Barre divergente autour de zéro : corail vers la droite (vieillit), vert d'eau vers la gauche (rajeunit). */
function Bar({ years, max }: { years: number; max: number }) {
  return (
    <div className="relative h-2.5 flex-1">
      <div className="absolute inset-y-[-3px] left-1/2 w-px bg-line-strong" />
      <div
        className={`absolute inset-y-0 rounded-[2px] ${years >= 0 ? "left-1/2 bg-gain" : "right-1/2 bg-loss"}`}
        style={{ width: `${(Math.abs(years) / max) * 50}%` }}
      />
    </div>
  );
}

/**
 * « Pourquoi cet âge ? » : les sites qui ont le plus vieilli ou rajeuni la personne, comparée à une personne
 * typique de son âge civil. Calculé dans le navigateur à partir des poids de l'ElasticNet.
 */
export default function WhyAge({ weights, sample }: { weights: Weights; sample: Sample | null }) {
  const [hover, setHover] = useState<number | null>(null);

  const view = useMemo(() => {
    if (!sample) return null;
    const { refAge, predicted, contributions } = explainAge(weights, sample.betas, sample.age);
    const ranked = contributions.map((c, i) => ({ ...c, i })).sort((a, b) => Math.abs(b.years) - Math.abs(a.years));
    const top = ranked.slice(0, TOP);
    const rest = ranked.slice(TOP).reduce((s, c) => s + c.years, 0);
    const max = Math.max(...top.map((c) => Math.abs(c.years)), Math.abs(rest), 0.1);
    return { refAge, predicted, top, rest, max, nRest: ranked.length - TOP };
  }, [weights, sample]);

  if (!sample || !view) return <div className="absolute inset-0 animate-pulse bg-panel-2/40" />;

  const h = hover !== null ? view.top[hover] : null;

  return (
    <div className="no-scrollbar absolute inset-0 flex flex-col overflow-y-auto p-3">
      <div className="num flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-ink-3">
          typique à {Math.round(sample.age)} ans <span className="text-ink">{fmt1.format(view.refAge)}</span>
        </span>
        <span className="text-ink-3">
          prédit <span className="text-amber">{fmt1.format(view.predicted)}</span>
        </span>
      </div>

      <ul className="mt-3 space-y-1.5" onMouseLeave={() => setHover(null)}>
        {view.top.map((c, k) => (
          <li key={c.cpg.cpg} className="flex items-center gap-2" onMouseEnter={() => setHover(k)}>
            <span className={`w-16 truncate text-[11px] ${hover === k ? "text-ink" : "text-ink-2"}`} title={c.cpg.cpg}>
              {c.cpg.gene ?? c.cpg.cpg}
            </span>
            <Bar years={c.years} max={view.max} />
            <span className="num w-12 text-right text-[11px] text-ink">{signed(c.years)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 border-t border-line pt-1.5">
          <span className="w-16 text-[11px] text-ink-3">{view.nRest} autres</span>
          <Bar years={view.rest} max={view.max} />
          <span className="num w-12 text-right text-[11px] text-ink-2">{signed(view.rest)}</span>
        </li>
      </ul>

      <p className="mt-auto pt-3 text-[10px] leading-snug text-ink-3">
        {h ? (
          <>
            <span className="num text-ink-2">{h.cpg.cpg}</span> : β {sample.betas[h.i].toFixed(3)} contre {expectedBeta(h.cpg, sample.age).toFixed(3)} attendu à{" "}
            {Math.round(sample.age)} ans, poids {h.cpg.weight.toFixed(2)}.
          </>
        ) : (
          <>
            <span className="text-gain-glow">Corail</span> : le site vieillit la personne. <span className="text-loss-glow">Vert d&apos;eau</span> : il la rajeunit.
            Écart par rapport à une personne typique de son âge, en années.
          </>
        )}
      </p>
    </div>
  );
}

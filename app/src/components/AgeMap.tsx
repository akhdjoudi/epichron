"use client";

import { useEffect, useRef, useState } from "react";
import type { Prediction } from "@/lib/clock";
import { fmt1 } from "@/lib/clock";

const W = 520;
const H = 300;
const PAD = { l: 38, r: 14, t: 14, b: 30 };
const x = (a: number) => PAD.l + (a / 100) * (W - PAD.l - PAD.r);
const y = (a: number) => H - PAD.b - (a / 100) * (H - PAD.t - PAD.b);

type Props = { predictions: Prediction[]; selected: { gsm: string; age: number; predicted: number } | null; mae: number };

/** Carte âge réel × âge prédit : chaque point est une personne jamais vue à l'entraînement, le viseur ambre suit l'individu choisi. */
export default function AgeMap({ predictions, selected, mae }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Prediction | null>(null);
  const points = predictions.filter((p) => p.split !== "train");
  const [pulse, setPulse] = useState(0);
  useEffect(() => setPulse((p) => p + 1), [selected?.gsm]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    let best: Prediction | null = null;
    let bestD = 14 ** 2;
    for (const p of points) {
      const d = (x(p.age) - px) ** 2 + (y(p.predicted_age) - py) ** 2;
      if (d < bestD) [best, bestD] = [p, d];
    }
    setHover(best);
  }

  // Droite prédit = réel + offset, coupée au cadre 0–100.
  const band = (offset: number) =>
    offset >= 0 ? `M ${x(0)} ${y(offset)} L ${x(100 - offset)} ${y(100)}` : `M ${x(-offset)} ${y(0)} L ${x(100)} ${y(100 + offset)}`;

  return (
    <div className="absolute inset-0 flex">
      <div className="flex w-32 shrink-0 flex-col justify-between border-r border-line p-3">
        <div className="num space-y-0.5 text-[13px]">
          <p>RÉEL {selected ? fmt1.format(selected.age) : "–"}</p>
          <p className="text-amber">PRÉDIT {selected ? fmt1.format(selected.predicted) : "–"}</p>
          <p className="text-ink-2">
            ÉCART {selected ? `${selected.predicted >= selected.age ? "+" : "−"}${fmt1.format(Math.abs(selected.predicted - selected.age))}` : "–"}
          </p>
        </div>
        <div className="space-y-1 text-[11px] text-ink-2">
          <p className="label">Détails</p>
          <p className="flex justify-between"><span>Personnes</span><span className="num text-ink">{points.length}</span></p>
          <p className="flex justify-between"><span>Erreur moy.</span><span className="num text-ink">{fmt1.format(mae)}</span></p>
        </div>
      </div>
      <div className="relative min-w-0 flex-1 p-2">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Âge réel contre âge prédit, cohortes de test et externe">
          {[0, 20, 40, 60, 80, 100].map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(100)} stroke="var(--line)" />
              <line x1={x(0)} x2={x(100)} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={x(t)} y={H - 12} textAnchor="middle" className="num" fontSize="9" fill="var(--ink-3)">{t}</text>
              <text x={PAD.l - 6} y={y(t)} textAnchor="end" dominantBaseline="central" className="num" fontSize="9" fill="var(--ink-3)">{t}</text>
            </g>
          ))}
          <text x={x(100)} y={H - 1} textAnchor="end" className="num" fontSize="9" fill="var(--ink-3)">ÂGE RÉEL</text>
          <text x={PAD.l - 30} y={PAD.t - 4} className="num" fontSize="9" fill="var(--ink-3)">PRÉDIT</text>
          <path d={band(0)} stroke="var(--ink-3)" strokeWidth={1} />
          <path d={band(mae)} stroke="var(--ink-3)" strokeDasharray="3 4" fill="none" />
          <path d={band(-mae)} stroke="var(--ink-3)" strokeDasharray="3 4" fill="none" />
          <text x={x(14)} y={y(40)} className="num" fontSize="9" fill="var(--ink-2)">EN AVANCE</text>
          <text x={x(66)} y={y(40)} className="num" fontSize="9" fill="var(--ink-2)">EN RETARD</text>
          {points.map((p) => (
            <circle key={p.gsm} cx={x(p.age)} cy={y(p.predicted_age)} r={1.6} fill={p.acceleration >= 0 ? "var(--gain)" : "var(--loss)"} opacity={0.55} />
          ))}
          {selected && (
            <g key={pulse}>
              <line x1={x(0)} x2={x(100)} y1={y(selected.predicted)} y2={y(selected.predicted)} stroke="var(--amber)" strokeOpacity={0.45} />
              <line x1={x(selected.age)} x2={x(selected.age)} y1={y(0)} y2={y(100)} stroke="var(--amber)" strokeOpacity={0.45} />
              <circle cx={x(selected.age)} cy={y(selected.predicted)} r={9} fill="none" stroke="var(--amber)" strokeOpacity={0.5}>
                <animate attributeName="r" from="4" to="16" dur="1.4s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" from="0.7" to="0" dur="1.4s" repeatCount="indefinite" />
              </circle>
              <path d={`M ${x(selected.age)} ${y(selected.predicted) - 6} L ${x(selected.age) + 1.6} ${y(selected.predicted) - 1.6} L ${x(selected.age) + 6} ${y(selected.predicted)} L ${x(selected.age) + 1.6} ${y(selected.predicted) + 1.6} L ${x(selected.age)} ${y(selected.predicted) + 6} L ${x(selected.age) - 1.6} ${y(selected.predicted) + 1.6} L ${x(selected.age) - 6} ${y(selected.predicted)} L ${x(selected.age) - 1.6} ${y(selected.predicted) - 1.6} Z`} fill="var(--amber)" />
            </g>
          )}
          {hover && <circle cx={x(hover.age)} cy={y(hover.predicted_age)} r={4.5} fill={hover.acceleration >= 0 ? "var(--gain)" : "var(--loss)"} stroke="var(--panel)" strokeWidth={2} />}
        </svg>
        {hover && (
          <div className="num pointer-events-none absolute right-3 top-3 rounded-[2px] border border-line-strong bg-panel/95 px-2 py-1 text-[10px] text-ink-2">
            {hover.gsm} · {hover.split === "test" ? "test" : "externe"} · réel <span className="text-ink">{fmt1.format(hover.age)}</span> · prédit <span className="text-ink">{fmt1.format(hover.predicted_age)}</span>
          </div>
        )}
        <div className="absolute bottom-1 left-3 flex gap-3 text-[10px] text-ink-3">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-gain" />en avance</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-loss" />en retard</span>
          <span>– – ± erreur moyenne</span>
        </div>
      </div>
    </div>
  );
}

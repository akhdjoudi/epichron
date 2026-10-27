"use client";

import { useState } from "react";
import type { Marker } from "@/lib/clock";

const W = 320;
const H = 200;
const PAD = { l: 34, r: 10, t: 12, b: 26 };
const x = (age: number) => PAD.l + (age / 100) * (W - PAD.l - PAD.r);
const y = (beta: number) => H - PAD.b - beta * (H - PAD.t - PAD.b);

function fit(points: [number, number][]) {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  const b = points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / points.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  return { a: my - b * mx, b };
}

function MarkerChart({ marker }: { marker: Marker }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const gain = marker.r > 0;
  const color = gain ? "var(--gain)" : "var(--loss)";
  const { a, b } = fit(marker.points);
  const ages = marker.points.map((p) => p[0]);
  const lo = Math.min(...ages);
  const hi = Math.max(...ages);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    let best: [number, number] | null = null;
    let bestD = 18 ** 2;
    for (const p of marker.points) {
      const d = (x(p[0]) - px) ** 2 + (y(p[1]) - py) ** 2;
      if (d < bestD) [best, bestD] = [p, d];
    }
    setHover(best);
  }

  return (
    <figure className="rounded-[3px] border border-line bg-panel-2/40 p-3">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink">{marker.gene ?? "intergénique"}</span>
        <span className="num text-xs text-ink-3">
          r = {marker.r > 0 ? "+" : "−"}
          {Math.abs(marker.r).toFixed(2)}
        </span>
      </figcaption>
      <p className="num mt-1 text-[11px] text-ink-3">{marker.cpg}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`Méthylation de ${marker.cpg} selon l'âge`}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={PAD.l - 6} y={y(t)} textAnchor="end" dominantBaseline="central" className="num" fontSize="10" fill="var(--ink-3)">
              {t}
            </text>
          </g>
        ))}
        {[20, 40, 60, 80, 100].map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="num" fontSize="10" fill="var(--ink-3)">
            {t}
          </text>
        ))}
        {marker.points.map(([age, beta], i) => (
          <circle key={i} cx={x(age)} cy={y(beta)} r={1.8} fill={color} opacity={0.4} />
        ))}
        <line x1={x(lo)} y1={y(a + b * lo)} x2={x(hi)} y2={y(a + b * hi)} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />
        {hover && (
          <g>
            <circle cx={x(hover[0])} cy={y(hover[1])} r={5} fill={color} stroke="var(--panel)" strokeWidth={2} />
            <text x={Math.min(x(hover[0]) + 8, W - 90)} y={Math.max(y(hover[1]) - 10, 14)} className="num" fontSize="11" fill="var(--ink)">
              {hover[0]} ans · β {hover[1].toFixed(2)}
            </text>
          </g>
        )}
      </svg>
      <p className="mt-1 text-[11px] text-ink-3">Âge (ans) en abscisse, méthylation β en ordonnée · {marker.points.length} personnes</p>
    </figure>
  );
}

export default function Markers({ markers }: { markers: Marker[] }) {
  return (
    <div className="grid gap-2 p-2 sm:grid-cols-2 xl:grid-cols-3">
      {markers.map((m) => (
        <MarkerChart key={m.cpg} marker={m} />
      ))}
    </div>
  );
}

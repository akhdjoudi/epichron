"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Sample, Weights } from "@/lib/clock";

type Props = {
  weights: Weights;
  samples: Sample[];
  index: number;
  onSelect: (i: number) => void;
  normalized: boolean;
  color: boolean;
  labels: boolean;
};

/**
 * Le méthylome des individus de démonstration, rendu comme un cliché : une ligne par personne (rangée par âge),
 * une colonne par site de l'horloge (rangés de « se déméthyle » à « se méthyle »). Plus c'est sombre, plus c'est méthylé.
 */
export default function Methylome({ weights, samples, index, onSelect, normalized, color, labels }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);

  const order = useMemo(() => weights.cpgs.map((c, k) => [c.r, k] as const).sort((a, b) => a[0] - b[0]).map(([, k]) => k), [weights]);

  // Petite image source (colonnes × lignes), agrandie avec lissage pour l'aspect « film ».
  const source = useMemo(() => {
    if (!samples.length) return null;
    const cols = order.length;
    const rows = samples.length;
    const stats = order.map((k) => {
      const v = samples.map((s) => s.betas[k]);
      const mean = v.reduce((a, b) => a + b, 0) / rows;
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / rows) || 1;
      return { mean, sd };
    });
    const img = new ImageData(cols, rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const beta = samples[r].betas[order[c]];
        const z = Math.max(-2.5, Math.min(2.5, (beta - stats[c].mean) / stats[c].sd)) / 2.5;
        const v = normalized ? (z + 1) / 2 : beta;
        const p = 4 * (r * cols + c);
        if (color) {
          // Divergente : vert d'eau (sous la moyenne) → gris neutre → corail (au-dessus).
          const t = Math.abs(z);
          const [R, G, B] = z < 0 ? [34, 165, 130] : [224, 102, 63];
          img.data[p] = 60 + (R - 60) * t;
          img.data[p + 1] = 62 + (G - 62) * t;
          img.data[p + 2] = 68 + (B - 68) * t;
        } else {
          const g = 215 - 175 * v;
          img.data[p] = g;
          img.data[p + 1] = g;
          img.data[p + 2] = g;
        }
        img.data[p + 3] = 255;
      }
    }
    const off = document.createElement("canvas");
    off.width = cols;
    off.height = rows;
    off.getContext("2d")!.putImageData(img, 0, 0);
    return off;
  }, [samples, order, normalized, color]);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !source || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr;
    cv.height = size.h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = color ? "none" : "blur(0.6px) contrast(1.15)";
    ctx.drawImage(source, 0, 0, cv.width, cv.height);
    ctx.filter = "none";
    // Vignettage du cliché.
    const g = ctx.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.2, cv.width / 2, cv.height / 2, cv.width * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }, [source, size, color]);

  const rows = samples.length;
  const rowH = rows ? size.h / rows : 0;
  const sample = samples[index];
  const hoverCpg = hover ? weights.cpgs[order[hover.col]] : null;

  function locate(e: React.MouseEvent) {
    const rect = wrap.current!.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * order.length);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * rows);
    return { row: Math.max(0, Math.min(rows - 1, row)), col: Math.max(0, Math.min(order.length - 1, col)) };
  }

  return (
    <div className="absolute inset-2 overflow-hidden rounded-[2px] border border-line-strong bg-[#cfd0d2]">
      <div
        ref={wrap}
        className="film absolute inset-0 cursor-crosshair"
        onMouseMove={(e) => setHover(locate(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSelect(locate(e).row)}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {sample && (
          <>
            <div className="absolute inset-x-0 border-y border-amber/90" style={{ top: index * rowH - 1, height: rowH + 2 }} />
            <span className="absolute left-0 h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-amber" style={{ top: index * rowH + rowH / 2 - 5 }} />
            <span className="absolute right-0 h-0 w-0 border-y-[5px] border-r-[7px] border-y-transparent border-r-amber" style={{ top: index * rowH + rowH / 2 - 5 }} />
          </>
        )}
        {hover && <div className="pointer-events-none absolute inset-y-0 w-px bg-amber/60" style={{ left: ((hover.col + 0.5) / order.length) * size.w }} />}
      </div>

      <div className="num pointer-events-none absolute left-2 top-1.5 text-[11px] font-medium text-black/80 mix-blend-multiply">
        {sample ? `${sample.gsm} · ${sample.sex ?? "?"} · ${Math.round(sample.age)} ANS` : "chargement…"}
      </div>
      <div className="num pointer-events-none absolute right-2 top-1.5 text-right text-[10px] leading-tight text-black/70">
        {order.length} CPG × {rows} IND.
        <br />
        {normalized ? "Z PAR SITE" : "β BRUT"}
      </div>
      {labels && (
        <>
          <div className="num pointer-events-none absolute bottom-1.5 left-2 right-2 flex justify-between text-[10px] text-black/70">
            <span>← SE DÉMÉTHYLE AVEC L&apos;ÂGE</span>
            <span>SE MÉTHYLE →</span>
          </div>
          <div className="num pointer-events-none absolute left-2 top-8 text-[10px] text-black/60">↓ âge croissant</div>
        </>
      )}
      {hover && hoverCpg && (
        <div className="num pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[2px] bg-black/85 px-2 py-1 text-[10px] text-ink">
          {hoverCpg.cpg} · {hoverCpg.gene ?? "intergénique"} · {Math.round(samples[hover.row].age)} ans · β {samples[hover.row].betas[order[hover.col]].toFixed(3)}
        </div>
      )}
    </div>
  );
}

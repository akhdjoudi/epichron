"use client";

import { fmt0, fmt1, type Sample } from "@/lib/clock";
import { Preset, SectionLabel } from "./ui";

export type Model = "elasticnet" | "lightgbm";

type Props = {
  samples: Sample[];
  index: number;
  onSelect: (i: number) => void;
  predicted: number | null;
  predictedAll: number[];
  model: Model;
  onModel: (m: Model) => void;
  mae: Record<Model, number>;
};

/** Règle graduée 0–100 ans façon réglage d'incidence : le curseur s'aimante sur la personne d'âge le plus proche. */
function Ruler({ value, onChange }: { value: number; onChange: (age: number) => void }) {
  return (
    <div className="relative mt-2 h-9 rounded-[3px] border border-amber/70 bg-black/40">
      <div className="absolute inset-x-2 inset-y-0">
        {Array.from({ length: 51 }, (_, i) => (
          <span key={i} className={`absolute bottom-1 w-px ${i % 5 === 0 ? "h-3.5 bg-ink-3" : "h-2 bg-line-strong"}`} style={{ left: `${i * 2}%` }} />
        ))}
        <span className="absolute inset-y-1 w-2.5 -translate-x-1/2 rounded-[2px] bg-amber shadow-[0_0_12px_var(--amber)]" style={{ left: `${value}%` }} />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Âge cible"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}

/** Jauge verticale de l'âge prédit, pendant de la jauge d'angulation. */
function Gauge({ value }: { value: number | null }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="num text-[9px] text-ink-3">100</span>
      <div className="relative h-36 w-5 rounded-[3px] border border-amber/70 bg-black/40">
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} className="absolute left-1 right-1 h-px bg-line-strong" style={{ bottom: `${i * 10}%` }} />
        ))}
        {value !== null && (
          <span className="absolute inset-x-0.5 h-1.5 -translate-y-1/2 rounded-[1px] bg-amber shadow-[0_0_10px_var(--amber)] transition-[top] duration-500" style={{ top: `${100 - Math.min(100, Math.max(0, value))}%` }} />
        )}
      </div>
      <span className="num text-[9px] text-ink-3">0</span>
    </div>
  );
}

export default function Controls({ samples, index, onSelect, predicted, predictedAll, model, onModel, mae }: Props) {
  const sample = samples[index];

  function nearest(age: number) {
    let best = 0;
    samples.forEach((s, i) => {
      if (Math.abs(s.age - age) < Math.abs(samples[best].age - age)) best = i;
    });
    onSelect(best);
  }

  const gaps = predictedAll.map((p, i) => p - samples[i].age);
  const argmax = (v: number[]) => v.reduce((b, x, i) => (x > v[b] ? i : b), 0);
  const argmin = (v: number[]) => v.reduce((b, x, i) => (x < v[b] ? i : b), 0);
  const presets =
    samples.length > 0
      ? [
          { title: "Plus jeune", i: 0, sub: `${fmt0.format(samples[0].age)} ans` },
          { title: "Médiane", i: Math.floor(samples.length / 2), sub: `${fmt0.format(samples[Math.floor(samples.length / 2)].age)} ans` },
          { title: "Plus âgé", i: samples.length - 1, sub: `${fmt0.format(samples[samples.length - 1].age)} ans` },
          { title: "Avance max", i: argmax(gaps), sub: `+${fmt1.format(gaps[argmax(gaps)])} ans` },
          { title: "Retard max", i: argmin(gaps), sub: `−${fmt1.format(Math.abs(gaps[argmin(gaps)]))} ans` },
          { title: "Au hasard", i: -1, sub: "tirage" },
        ]
      : [];

  return (
    <div className="no-scrollbar absolute inset-0 overflow-y-auto p-3">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className="label">Âge réel · sélection</p>
          <p className="num mt-1 text-2xl font-medium">{sample ? `${fmt1.format(sample.age)} ans` : "–"}</p>
          <Ruler value={sample?.age ?? 50} onChange={nearest} />
          <div className="num mt-1 flex justify-between text-[9px] text-ink-3">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
          <div className="mt-4 text-right">
            <p className="label">Âge épigénétique · {model === "elasticnet" ? "calcul local" : "précalculé"}</p>
            <p className="num mt-1 text-2xl font-medium text-amber">{predicted !== null ? `${fmt1.format(predicted)} ans` : "–"}</p>
          </div>
        </div>
        <Gauge value={predicted} />
      </div>

      <SectionLabel>Préréglages · cohorte externe</SectionLabel>
      <div className="grid grid-cols-3 gap-1">
        {presets.map((p) => (
          <Preset
            key={p.title}
            title={p.title}
            sub={p.sub}
            active={p.i === index}
            onClick={() => onSelect(p.i >= 0 ? p.i : Math.floor(Math.random() * samples.length))}
          />
        ))}
      </div>

      <SectionLabel>Modèle</SectionLabel>
      <div className="grid grid-cols-2 gap-1">
        <Preset title="ElasticNet" sub={`MAE ${fmt1.format(mae.elasticnet)} · navigateur`} active={model === "elasticnet"} onClick={() => onModel("elasticnet")} />
        <Preset title="LightGBM" sub={`MAE ${fmt1.format(mae.lightgbm)} · précalculé`} active={model === "lightgbm"} onClick={() => onModel("lightgbm")} />
      </div>

      {sample && (
        <>
          <SectionLabel>Individu</SectionLabel>
          <dl className="num grid grid-cols-2 gap-y-1 text-[11px]">
            <dt className="text-ink-3">GEO</dt>
            <dd className="text-right text-ink">{sample.gsm}</dd>
            <dt className="text-ink-3">Sexe</dt>
            <dd className="text-right text-ink">{sample.sex === "F" ? "Femme" : sample.sex === "M" ? "Homme" : "n.r."}</dd>
            <dt className="text-ink-3">Cohorte</dt>
            <dd className="text-right text-ink">GSE87571 · jamais vue</dd>
          </dl>
        </>
      )}
    </div>
  );
}

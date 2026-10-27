"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { parsePredictions, predictAge, type Prediction, type Ring, type Sample, type Weights } from "@/lib/clock";
import AgeMap from "./AgeMap";
import Controls, { type Model } from "./Controls";
import Rings from "./Rings";
import type { SiteFilter } from "./three/GenomeScene";
import Tour from "./Tour";
import { Panel, Segmented, Toggle } from "./ui";
import WhyAge from "./WhyAge";

const GenomeScene = dynamic(() => import("./three/GenomeScene"), { ssr: false });

type Props = { weights: Weights; mae: Record<Model, number> };

export default function Workstation({ weights, mae }: Props) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [index, setIndex] = useState(0);
  const [model, setModel] = useState<Model>("elasticnet");
  const [rings, setRings] = useState<Ring[]>([]);
  const [tour, setTour] = useState(false);
  const [ghost, setGhost] = useState(true);
  const [labels, setLabels] = useState(true);
  const [filter, setFilter] = useState<SiteFilter>("all");
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/samples.json")
      .then((r) => r.json())
      .then((d: { samples: Sample[] }) => {
        setSamples(d.samples);
        setIndex(Math.floor(d.samples.length * 0.6));
      });
    fetch("/data/predictions.csv")
      .then((r) => r.text())
      .then((t) => setPredictions(parsePredictions(t)));
    fetch("/data/rings.json")
      .then((r) => r.json())
      .then((d: { rings: Ring[] }) => setRings(d.rings));
  }, []);

  const predictedAll = useMemo(
    () => samples.map((s) => (model === "elasticnet" ? predictAge(weights, s.betas) : s.lightgbm)),
    [samples, weights, model],
  );
  const sample = samples[index] ?? null;
  const predicted = sample ? predictedAll[index] : null;

  return (
    <div className="flex flex-col">
      <header className="flex h-11 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-medium tracking-tight">EpiChron</span>
          <svg viewBox="0 0 16 16" className="size-3.5 text-ink-3" aria-hidden>
            <path d="M5 1c0 4 6 4 6 7s-6 3-6 7M11 1c0 4-6 4-6 7s6 3 6 7M5.6 4h4.8M5.6 12h4.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <nav className="ml-4 hidden gap-4 text-[12px] text-ink-3 sm:flex">
            <a href="#rapport" className="hover:text-ink">Rapport</a>
            <a href="#methode" className="hover:text-ink">Méthode</a>
            <a href="https://github.com/akhdjoudi/epichron" className="hover:text-ink">GitHub</a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTour(true)}
            className="rounded-[3px] border border-amber/80 bg-amber/10 px-2.5 py-1 text-[11px] text-amber transition hover:bg-amber/20"
          >
            Visite guidée
          </button>
          <p className="hidden text-[11px] italic text-ink-3 md:block">Usage pédagogique · données publiques GEO</p>
        </div>
      </header>

      <div className="grid gap-2 p-2 lg:h-[calc(100svh-44px)] lg:grid-cols-[1.1fr_1fr_0.62fr]">
        <Panel
          id="panel-genome"
          title="3D · Génome"
          className="h-[78svh] lg:h-auto"
          tools={
            <>
              <Toggle on={ghost} onClick={() => setGhost((v) => !v)}>Transparence</Toggle>
              <Toggle on={labels} onClick={() => setLabels((v) => !v)}>Étiquettes</Toggle>
            </>
          }
        >
          <div className="absolute inset-0 bottom-12">
            <GenomeScene cpgs={weights.cpgs} betas={sample?.betas ?? null} filter={filter} ghost={ghost} labels={labels} hovered={hovered} onHover={setHovered} />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex h-12 items-center gap-3 border-t border-line px-3">
            <span className="label">Sites</span>
            <Segmented<SiteFilter>
              value={filter}
              onChange={setFilter}
              options={[["all", "Tous"], ["gain", "Gain"], ["loss", "Perte"], ["top", "Top 20"]]}
            />
          </div>
        </Panel>

        <div className="grid gap-2 lg:grid-rows-[1.5fr_1fr]">
          <Panel id="panel-rings" title="Cernes · méthylation moyenne par décennie" className="h-[56svh] lg:h-auto">
            <Rings cpgs={weights.cpgs} rings={rings} realAge={sample?.age ?? null} bioAge={predicted} />
          </Panel>
          <Panel id="panel-agemap" title="Âge réel × âge prédit" className="h-[340px] lg:h-auto">
            <AgeMap predictions={predictions} selected={sample && predicted !== null ? { gsm: sample.gsm, age: sample.age, predicted } : null} mae={mae[model]} />
          </Panel>
        </div>

        <div className="grid gap-2 lg:grid-rows-[1.15fr_1fr]">
          <Panel id="panel-controls" title="Commandes" className="h-[560px] lg:h-auto">
            <Controls
              samples={samples}
              index={index}
              onSelect={setIndex}
              predicted={predicted}
              predictedAll={predictedAll}
              model={model}
              onModel={setModel}
              mae={mae}
            />
          </Panel>
          <Panel id="panel-why" title="Pourquoi cet âge ? · ElasticNet" className="h-[340px] lg:h-auto">
            <WhyAge weights={weights} sample={sample} />
          </Panel>
        </div>
      </div>
      <Tour open={tour} onClose={() => setTour(false)} />
    </div>
  );
}

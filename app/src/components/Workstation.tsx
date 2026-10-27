"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { parsePredictions, predictAge, type Prediction, type Sample, type Weights } from "@/lib/clock";
import AgeMap from "./AgeMap";
import Controls, { type Model } from "./Controls";
import Faces from "./Faces";
import type { HeadView } from "./three/AgingHeadsScene";
import type { SiteFilter } from "./three/GenomeScene";
import { Panel, Segmented, Toggle } from "./ui";

const GenomeScene = dynamic(() => import("./three/GenomeScene"), { ssr: false });
const HelixScene = dynamic(() => import("./three/HelixScene"), { ssr: false });

type Props = { weights: Weights; mae: Record<Model, number> };

export default function Workstation({ weights, mae }: Props) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [index, setIndex] = useState(0);
  const [model, setModel] = useState<Model>("elasticnet");
  const [headView, setHeadView] = useState<HeadView>("trois-quarts");
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
        <p className="text-[11px] italic text-ink-3">Usage pédagogique · données publiques GEO</p>
      </header>

      <div className="grid gap-2 p-2 lg:h-[calc(100svh-44px)] lg:grid-cols-[1.1fr_1fr_0.62fr]">
        <Panel
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
          <Panel
            title="Visage · âge civil et âge biologique"
            className="h-[52svh] lg:h-auto"
            tools={
              <>
                <Toggle on={headView === "face"} onClick={() => setHeadView("face")}>Face</Toggle>
                <Toggle on={headView === "trois-quarts"} onClick={() => setHeadView("trois-quarts")}>3/4</Toggle>
                <Toggle on={headView === "profil"} onClick={() => setHeadView("profil")}>Profil</Toggle>
                <Toggle on={headView === "rotation"} onClick={() => setHeadView("rotation")}>Rotation</Toggle>
              </>
            }
          >
            <Faces realAge={sample?.age ?? null} bioAge={predicted} sampleKey={sample?.gsm ?? ""} view={headView} />
          </Panel>
          <Panel title="Âge réel × âge prédit" className="h-[340px] lg:h-auto">
            <AgeMap predictions={predictions} selected={sample && predicted !== null ? { gsm: sample.gsm, age: sample.age, predicted } : null} mae={mae[model]} />
          </Panel>
        </div>

        <div className="grid gap-2 lg:grid-rows-[1.7fr_1fr]">
          <Panel title="Commandes" className="h-[560px] lg:h-auto">
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
          <Panel title={sample ? `Locus · ${sample.gsm}` : "Locus"} className="h-[320px] lg:h-auto">
            <HelixScene cpgs={weights.cpgs} betas={sample?.betas ?? null} />
            <p className="pointer-events-none absolute bottom-2 left-3 right-3 text-[10px] leading-snug text-ink-3">
              Les 13 sites les plus lourds de l&apos;horloge sur une double hélice. Chaque sphère lumineuse est un groupe méthyle (CH₃) : elle grossit avec le β de l&apos;individu.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

"use client";

import { motion, useSpring, useTransform } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { fmt1 } from "@/lib/clock";
import type { HeadView } from "./three/AgingHeadsScene";

const AgingHeadsScene = dynamic(() => import("./three/AgingHeadsScene"), { ssr: false });

function Years({ value, signed = false }: { value: number; signed?: boolean }) {
  const spring = useSpring(value, { stiffness: 60, damping: 16 });
  useEffect(() => spring.set(value), [value, spring]);
  const text = useTransform(spring, (v) => `${signed ? (v >= 0 ? "+" : "−") : ""}${fmt1.format(signed ? Math.abs(v) : v)}`);
  return <motion.span>{text}</motion.span>;
}

type Props = { realAge: number | null; bioAge: number | null; sampleKey: string; view: HeadView };

/** Deux bustes vieillis par shader : à gauche l'âge civil, à droite l'âge épigénétique. */
export default function Faces({ realAge, bioAge, sampleKey, view }: Props) {
  const gap = realAge !== null && bioAge !== null ? bioAge - realAge : null;
  return (
    <>
      <div className="absolute inset-0">
        {realAge !== null && bioAge !== null && <AgingHeadsScene realAge={realAge} bioAge={bioAge} sampleKey={sampleKey} view={view} />}
      </div>

      <div className="pointer-events-none absolute inset-x-3 top-3 grid grid-cols-3 items-start gap-2">
        <div>
          <p className="label">Âge civil</p>
          <p className="num mt-1 text-2xl text-ink-2">{realAge !== null ? <Years value={realAge} /> : "–"}</p>
        </div>
        <div className="text-center">
          <p className="label">Écart</p>
          <p className={`num mt-1 text-lg ${gap !== null && gap >= 0 ? "text-gain-glow" : "text-loss-glow"}`}>
            {gap !== null ? <Years value={gap} signed /> : "–"} <span className="text-[11px] text-ink-3">ans</span>
          </p>
        </div>
        <div className="text-right">
          <p className="label">Âge biologique</p>
          <p className="num mt-1 text-2xl text-amber">{bioAge !== null ? <Years value={bioAge} /> : "–"}</p>
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-2 left-3 right-3 text-center text-[10px] leading-snug text-ink-3">
        Avatar générique vieilli par le rendu : ce n&apos;est pas le visage de la personne, les données ne contiennent que de la méthylation.
      </p>
    </>
  );
}

"use client";

import { motion, useSpring, useTransform } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { fmt1 } from "@/lib/clock";
import type { HoloView } from "./three/HoloHeadScene";

const HoloHeadScene = dynamic(() => import("./three/HoloHeadScene"), { ssr: false });

function Years({ value, signed = false }: { value: number; signed?: boolean }) {
  const spring = useSpring(value, { stiffness: 60, damping: 16 });
  useEffect(() => spring.set(value), [value, spring]);
  const text = useTransform(spring, (v) => `${signed ? (v >= 0 ? "+" : "−") : ""}${fmt1.format(signed ? Math.abs(v) : v)}`);
  return <motion.span>{text}</motion.span>;
}

type Props = { realAge: number | null; bioAge: number | null; sampleKey: string; view: HoloView };

/** Deux hologrammes côte à côte : la tête à l'âge civil (fantôme) et la tête à l'âge épigénétique. */
export default function Hologram({ realAge, bioAge, sampleKey, view }: Props) {
  const gap = realAge !== null && bioAge !== null ? bioAge - realAge : null;
  return (
    <>
      {realAge !== null && bioAge !== null && <HoloHeadScene realAge={realAge} bioAge={bioAge} sampleKey={sampleKey} view={view} />}

      <p className="pointer-events-none absolute left-3 top-3 max-w-[16rem] text-[10px] leading-snug text-ink-3">
        Avatar générique : la tête illustre un âge, ce n&apos;est pas le visage de la personne. Les données ne contiennent que de la méthylation.
      </p>

      <div className="pointer-events-none absolute inset-x-3 bottom-3 grid grid-cols-3 items-end gap-2">
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
    </>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Cpg, Ring } from "@/lib/clock";
import type { RingHover } from "./three/RingsScene";

const RingsScene = dynamic(() => import("./three/RingsScene"), { ssr: false });

type Props = { cpgs: Cpg[]; rings: Ring[]; realAge: number | null; bioAge: number | null };

/** Le méthylome en cernes d'arbre : on lit l'âge du centre vers l'écorce. */
export default function Rings({ cpgs, rings, realAge, bioAge }: Props) {
  const [hover, setHover] = useState<RingHover>(null);
  const site = hover ? cpgs[hover.site] : null;
  const ring = hover ? rings[hover.ring] : null;

  return (
    <>
      <div className="absolute inset-0">
        {rings.length > 0 && <RingsScene cpgs={cpgs} rings={rings} realAge={realAge} bioAge={bioAge} hover={hover} onHover={setHover} />}
      </div>

      <div className="pointer-events-none absolute left-3 top-3 max-w-[15rem] space-y-1.5 text-[10px] leading-snug text-ink-3">
        <p>
          <span className="text-ink-2">Un cerne par décennie</span> : 10 ans au centre, 90 ans et plus au bord.
        </p>
        <p>
          <span className="text-ink-2">Un rayon par site</span> de l&apos;horloge. Hauteur et éclat = méthylation moyenne, relative au site.
        </p>
      </div>
      <div className="pointer-events-none absolute right-3 top-3 space-y-1 text-right text-[10px] text-ink-2">
        <p className="flex items-center justify-end gap-1.5">se déméthylent avec l&apos;âge <span className="h-0.5 w-4 rounded bg-loss-glow" /></p>
        <p className="flex items-center justify-end gap-1.5">se méthylent avec l&apos;âge <span className="h-0.5 w-4 rounded bg-gain-glow" /></p>
        <p className="flex items-center justify-end gap-1.5">âge civil <span className="h-0.5 w-4 rounded bg-ink" /></p>
        <p className="flex items-center justify-end gap-1.5">âge biologique <span className="h-1 w-4 rounded bg-amber" /></p>
      </div>

      <div className="num pointer-events-none absolute bottom-2 left-3 right-3 text-[10px] text-ink-3">
        {site && ring ? (
          <span>
            <span className="text-ink">{site.gene ?? "intergénique"}</span> · {site.cpg} · {ring.decade === 90 ? "90 ans et +" : `${ring.decade}–${ring.decade + 9} ans`} · β moyen{" "}
            <span className="text-amber">{ring.betas[hover!.site].toFixed(3)}</span> · {ring.n} personnes
          </span>
        ) : (
          <span>Survole un cerne · glisse pour incliner la coupe · 1 388 personnes des deux cohortes</span>
        )}
      </div>
    </>
  );
}

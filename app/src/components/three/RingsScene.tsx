"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Cpg, Ring } from "@/lib/clock";

// Coupe de tronc : un cerne par décennie (centre = 10 ans, bord = 90 ans et plus), un rayon par site de l'horloge.
// Les sites sont rangés par corrélation à l'âge : une moitié se déméthyle, l'autre se méthyle en vieillissant.
const R0 = 0.8;
const WIDTH = 0.42;
const GAP = 0.09; // radians laissés libres entre les deux moitiés

export const ringRadius = (age: number) => R0 + ((Math.min(Math.max(age, 10), 100) - 10) / 10) * WIDTH;

// Chaque moitié s'allume dans sa couleur : vert d'eau pour les sites qui se déméthylent, corail pour ceux qui se méthylent.
const DARK = new THREE.Color("#0e1117");
const LOSS_BRIGHT = new THREE.Color("#7ff5d2");
const GAIN_BRIGHT = new THREE.Color("#ffb28c");

export type RingHover = { site: number; ring: number } | null;

type Layout = { order: number[]; angles: number[]; split: number; arc: number };

function useLayout(cpgs: Cpg[]): Layout {
  return useMemo(() => {
    const order = cpgs.map((_, k) => k).sort((a, b) => cpgs[a].r - cpgs[b].r);
    const split = order.findIndex((k) => cpgs[k].r > 0);
    const arc = (2 * Math.PI - 2 * GAP) / order.length;
    // Moitié « perte » puis moitié « gain », séparées par un vide de chaque côté.
    const angles = order.map((_, i) => GAP / 2 + i * arc + (i >= split ? GAP : 0) + arc / 2);
    return { order, angles, split, arc };
  }, [cpgs]);
}

function Cells({ cpgs, rings, layout, onHover }: { cpgs: Cpg[]; rings: Ring[]; layout: Layout; onHover: (h: RingHover) => void }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = rings.length * cpgs.length;

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    layout.order.forEach((k, i) => {
      // Niveau relatif au site : 0 = sa décennie la moins méthylée, 1 = la plus méthylée.
      const values = rings.map((r) => r.betas[k]);
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      const a = layout.angles[i];
      rings.forEach((ring, d) => {
        const level = hi > lo ? (ring.betas[k] - lo) / (hi - lo) : 0.5;
        const radius = R0 + (d + 0.5) * WIDTH;
        const h = 0.04 + level * 0.55;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
        m.compose(
          new THREE.Vector3(radius * Math.cos(a), h / 2, radius * Math.sin(a)),
          q,
          new THREE.Vector3(WIDTH * 0.86, h, radius * layout.arc * 0.82),
        );
        const id = d * cpgs.length + i;
        mesh.current!.setMatrixAt(id, m);
        mesh.current!.setColorAt(id, color.copy(DARK).lerp(i >= layout.split ? GAIN_BRIGHT : LOSS_BRIGHT, 0.08 + 0.92 * level * level));
      });
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    mesh.current!.instanceColor!.needsUpdate = true;
  }, [cpgs, rings, layout]);

  function hover(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    onHover({ ring: Math.floor(e.instanceId / cpgs.length), site: layout.order[e.instanceId % cpgs.length] });
  }

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} onPointerMove={hover} onPointerOut={() => onHover(null)}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.5} metalness={0.1} />
    </instancedMesh>
  );
}

/** Anneau d'âge : blanc pour l'âge civil, ambre pour l'âge épigénétique. */
function AgeRing({ age, color, tube }: { age: number; color: string; tube: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const shown = useRef(age);
  useFrame(() => {
    shown.current = THREE.MathUtils.lerp(shown.current, age, 0.08);
    const r = ringRadius(shown.current);
    ref.current?.scale.set(r, r, 1);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.66, 0]}>
      <torusGeometry args={[1, tube, 8, 160]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/** Liserés colorés : quelle moitié se déméthyle, laquelle se méthyle avec l'âge. */
function HalfRims({ layout, n }: { layout: Layout; n: number }) {
  const outer = R0 + 9 * WIDTH + 0.12;
  const lossArc = layout.split * layout.arc;
  const gainArc = (n - layout.split) * layout.arc;
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh rotation={[0, 0, -GAP / 2]} scale={[1, -1, 1]}>
        <torusGeometry args={[outer, 0.025, 6, 120, lossArc]} />
        <meshBasicMaterial color="#5ef0c0" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, 0, -(GAP * 1.5 + lossArc)]} scale={[1, -1, 1]}>
        <torusGeometry args={[outer, 0.025, 6, 120, gainArc]} />
        <meshBasicMaterial color="#ff8a63" toneMapped={false} />
      </mesh>
    </group>
  );
}

function Spin({ children, paused }: { children: React.ReactNode; paused: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current && !paused && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) g.current.rotation.y += dt * 0.06;
  });
  return <group ref={g}>{children}</group>;
}

type Props = {
  cpgs: Cpg[];
  rings: Ring[];
  realAge: number | null;
  bioAge: number | null;
  hover: RingHover;
  onHover: (h: RingHover) => void;
};

export default function RingsScene({ cpgs, rings, realAge, bioAge, hover, onHover }: Props) {
  const layout = useLayout(cpgs);
  return (
    <Canvas camera={{ position: [0, 8.2, 7.6], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true }} onPointerMissed={() => onHover(null)}>
      <color attach="background" args={["#0c0d10"]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 8, 4]} intensity={2} />
      <pointLight position={[-5, 3, -4]} intensity={30} color="#9fb4ff" />
      <Spin paused={hover !== null}>
        <Cells cpgs={cpgs} rings={rings} layout={layout} onHover={onHover} />
        <HalfRims layout={layout} n={cpgs.length} />
        {realAge !== null && <AgeRing age={realAge} color="#e6e7ea" tube={0.006} />}
        {bioAge !== null && <AgeRing age={bioAge} color="#e8a33a" tube={0.011} />}
      </Spin>
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.2} maxPolarAngle={1.2} />
      <EffectComposer>
        <Bloom mipmapBlur levels={5} radius={0.5} intensity={0.7} luminanceThreshold={0.8} />
      </EffectComposer>
    </Canvas>
  );
}

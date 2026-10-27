"use client";

import { GizmoHelper, GizmoViewcube, Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useMemo } from "react";
import * as THREE from "three";
import type { Cpg } from "@/lib/clock";

// Longueur et centromère (Mb) des chromosomes en hg19, la version du manifeste 450K.
const CHROMOSOMES: [string, number, number][] = [
  ["1", 249.3, 125.0], ["2", 243.2, 93.3], ["3", 198.0, 91.0], ["4", 191.2, 50.4], ["5", 180.9, 48.4],
  ["6", 171.1, 61.0], ["7", 159.1, 59.9], ["8", 146.4, 45.6], ["9", 141.2, 49.0], ["10", 135.5, 40.2],
  ["11", 135.0, 53.7], ["12", 133.9, 35.8], ["13", 115.2, 17.9], ["14", 107.3, 17.6], ["15", 102.5, 19.0],
  ["16", 90.4, 36.6], ["17", 81.2, 24.0], ["18", 78.1, 17.2], ["19", 59.1, 26.5], ["20", 63.0, 27.5],
  ["21", 48.1, 13.2], ["22", 51.3, 14.7], ["X", 155.3, 60.6],
];

const RING = 6.2;
const SCALE = 6 / 250; // unités 3D par Mb
const ARM = 0.24;
const GAIN = "#ff8a63";
const LOSS = "#5ef0c0";

export type SiteFilter = "all" | "gain" | "loss" | "top";

function layout(index: number) {
  const a = (index / CHROMOSOMES.length) * 2 * Math.PI;
  return { x: RING * Math.sin(a), z: RING * Math.cos(a), angle: a };
}

/** Un chromosome : deux bras (p et q) séparés par la constriction du centromère. */
function Chromosome({ index, ghost, label, active }: { index: number; ghost: boolean; label: boolean; active: boolean }) {
  const [name, length, centro] = CHROMOSOMES[index];
  const { x, z } = layout(index);
  const h = length * SCALE;
  const arms = [
    { len: centro * SCALE, y: h - (centro * SCALE) / 2 },
    { len: h - centro * SCALE, y: (h - centro * SCALE) / 2 },
  ];
  const fill = active ? "#7a3f34" : "#4a2a2c";
  return (
    <group position={[x, -h / 2, z]}>
      {arms.map((arm, i) => (
        <group key={i} position={[0, arm.y, 0]}>
          <mesh>
            <capsuleGeometry args={[ARM, Math.max(0.01, arm.len - 2 * ARM - 0.04), 6, 16]} />
            <meshStandardMaterial color={fill} roughness={0.7} transparent opacity={ghost ? 0.5 : 0.9} depthWrite={!ghost} />
          </mesh>
          {ghost && (
            <mesh>
              <capsuleGeometry args={[ARM * 1.01, Math.max(0.01, arm.len - 2 * ARM - 0.04), 4, 10]} />
              <meshBasicMaterial color="#c9cdd6" wireframe transparent opacity={0.05} />
            </mesh>
          )}
        </group>
      ))}
      {label && (
        <Html position={[0, h + 0.4, 0]} center zIndexRange={[10, 0]}>
          <span className="num pointer-events-none select-none text-[10px] text-ink-3">{name}</span>
        </Html>
      )}
    </group>
  );
}

/** Enveloppe nucléaire en fil de fer, pendant de la cage thoracique d'AngioView. */
function Nucleus() {
  const rings = useMemo(() => Array.from({ length: 9 }, (_, i) => -4 + i), []);
  return (
    <group>
      {rings.map((y) => {
        const r = Math.sqrt(Math.max(0, 9.5 ** 2 - (y * 1.6) ** 2));
        return (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, 0.008, 4, 128]} />
            <meshBasicMaterial color="#9aa0ad" transparent opacity={0.08} />
          </mesh>
        );
      })}
      <mesh>
        <icosahedronGeometry args={[9.5, 3]} />
        <meshBasicMaterial color="#9aa0ad" wireframe transparent opacity={0.012} />
      </mesh>
    </group>
  );
}

type Props = {
  cpgs: Cpg[];
  betas: number[] | null;
  filter: SiteFilter;
  ghost: boolean;
  labels: boolean;
  hovered: string | null;
  onHover: (cpg: string | null) => void;
};

export default function GenomeScene({ cpgs, betas, filter, ghost, labels, hovered, onHover }: Props) {
  const points = useMemo(() => {
    const maxW = Math.max(...cpgs.map((c) => Math.abs(c.weight)));
    return cpgs.flatMap((c, k) => {
      const index = CHROMOSOMES.findIndex(([name]) => name === c.chromosome);
      if (index < 0 || c.position === null) return [];
      const [, length] = CHROMOSOMES[index];
      const { x, z, angle } = layout(index);
      // Le point sort légèrement du chromosome, côté extérieur de l'anneau.
      const out = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(ARM + 0.04);
      const y = (length * SCALE) / 2 - (c.position / 1e6) * SCALE;
      return [{ c, k, index, pos: new THREE.Vector3(x + out.x, y, z + out.z), size: 0.06 + 0.17 * Math.sqrt(Math.abs(c.weight) / maxW) }];
    });
  }, [cpgs]);

  const visible = (k: number, c: Cpg) =>
    filter === "all" || (filter === "gain" && c.r > 0) || (filter === "loss" && c.r < 0) || (filter === "top" && k < 20);
  const hoveredPoint = points.find((p) => p.c.cpg === hovered);
  const named = points.filter((p) => p.c.gene && p.k < 5);

  return (
    <Canvas camera={{ position: [5, 6.5, 19], fov: 42 }} dpr={[1, 2]} gl={{ alpha: true }} onPointerMissed={() => onHover(null)}>
      <ambientLight intensity={0.6} />
      <pointLight position={[0, 9, 4]} intensity={90} color="#ffd7c2" />
      <pointLight position={[-10, -5, -6]} intensity={50} color="#9fd8ff" />
      <Nucleus />
      {CHROMOSOMES.map((_, i) => (
        <Chromosome key={i} index={i} ghost={ghost} label={labels} active={i === hoveredPoint?.index} />
      ))}
      {points.map(({ c, k, pos, size }) => {
        const on = visible(k, c);
        const color = c.r > 0 ? GAIN : LOSS;
        const beta = betas ? betas[k] : 0.5;
        const isHover = c.cpg === hovered;
        return (
          <mesh
            key={c.cpg}
            position={pos}
            scale={isHover ? size * 1.8 : size}
            visible={on}
            onPointerOver={(e) => {
              if (!on) return;
              e.stopPropagation();
              onHover(c.cpg);
            }}
            onPointerOut={() => onHover(null)}
          >
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isHover ? 6 : 0.5 + 3.5 * beta} toneMapped={false} />
          </mesh>
        );
      })}
      {labels &&
        named.map(({ c, pos }) => (
          <Html key={c.cpg} position={pos} zIndexRange={[15, 5]} style={{ pointerEvents: "none" }}>
            <span className="num ml-3 -translate-y-1/2 whitespace-nowrap rounded-[2px] border border-line-strong bg-black/70 px-1.5 py-0.5 text-[10px] text-ink-2">
              {c.gene}
            </span>
          </Html>
        ))}
      {hoveredPoint && (
        <Html position={hoveredPoint.pos} zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
          <div className="ml-4 w-52 -translate-y-1/2 rounded-[3px] border border-line-strong bg-panel/95 p-2.5 text-[11px] shadow-2xl">
            <p className="text-sm text-ink">{hoveredPoint.c.gene ?? "intergénique"}</p>
            <p className="num mt-0.5 text-[10px] text-ink-3">
              {hoveredPoint.c.cpg} · chr{hoveredPoint.c.chromosome}:{hoveredPoint.c.position?.toLocaleString("fr-FR")}
            </p>
            <div className="num mt-2 grid grid-cols-2 gap-y-0.5 text-ink-2">
              <span>poids</span>
              <span className="text-right text-ink">{hoveredPoint.c.weight.toFixed(3)}</span>
              <span>corr. âge</span>
              <span className="text-right text-ink">{hoveredPoint.c.r > 0 ? "+" : ""}{hoveredPoint.c.r.toFixed(2)}</span>
              {betas && (
                <>
                  <span>β individu</span>
                  <span className="text-right text-amber">{betas[hoveredPoint.k].toFixed(3)}</span>
                </>
              )}
            </div>
          </div>
        </Html>
      )}
      <OrbitControls makeDefault enablePan={false} enableZoom={false} autoRotate={!hovered} autoRotateSpeed={0.35} />
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.8} luminanceThreshold={0.6} />
      </EffectComposer>
      {/* Après le compositeur : sinon le post-traitement repeint par-dessus le cube d'orientation. */}
      <GizmoHelper alignment="bottom-left" margin={[52, 52]}>
        <GizmoViewcube
          faces={["D", "G", "H", "B", "A", "P"]}
          color="#17181d"
          textColor="#e6e7ea"
          strokeColor="#686c76"
          hoverColor="#e8a33a"
          opacity={0.95}
        />
      </GizmoHelper>
    </Canvas>
  );
}

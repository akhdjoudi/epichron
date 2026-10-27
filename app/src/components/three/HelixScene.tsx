"use client";

import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Cpg } from "@/lib/clock";

// Géométrie de l'ADN B : 10,5 paires de bases par tour, sillon mineur ~135°.
const PAIRS = 40;
const RADIUS = 1;
const RISE = 0.3;
const TWIST = (2 * Math.PI) / 10.5;
const GROOVE = Math.PI * 0.75;
const CPG_EVERY = 3;

const GAIN = new THREE.Color("#ff8a63");
const LOSS = new THREE.Color("#5ef0c0");
const UP = new THREE.Vector3(0, 1, 0);

function strandPoint(i: number, offset: number) {
  const a = i * TWIST + offset;
  return new THREE.Vector3(RADIUS * Math.cos(a), (i - PAIRS / 2) * RISE, RADIUS * Math.sin(a));
}

/** Place un cylindre unitaire (hauteur 1, axe Y) entre deux points. */
function segment(from: THREE.Vector3, to: THREE.Vector3, radius: number, m: THREE.Matrix4) {
  const dir = to.clone().sub(from);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  return m.compose(from.clone().add(to).multiplyScalar(0.5), q, new THREE.Vector3(radius, dir.length(), radius));
}

/** Double hélice dont les groupes méthyle (CH₃) grossissent avec le bêta de l'individu choisi. */
function Helix({ cpgs, betas }: { cpgs: Cpg[]; betas: number[] | null }) {
  const spin = useRef<THREE.Group>(null);
  const rungs = useRef<THREE.InstancedMesh>(null);
  const nodes = useRef<THREE.InstancedMesh>(null);
  const methyls = useRef<(THREE.Mesh | null)[]>([]);
  const shown = useRef<number[]>([]);

  const { strands, sites } = useMemo(() => {
    const s1 = Array.from({ length: PAIRS }, (_, i) => strandPoint(i, 0));
    const s2 = Array.from({ length: PAIRS }, (_, i) => strandPoint(i, GROOVE));
    const strands = [s1, s2].map((pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), PAIRS * 8, 0.05, 8));
    // Un site CpG toutes les trois paires, porté par les sites les plus lourds de l'horloge.
    const sites = cpgs.slice(0, Math.floor(PAIRS / CPG_EVERY)).map((cpg, k) => {
      const base = s1[k * CPG_EVERY + 1];
      const out = new THREE.Vector3(base.x, 0, base.z).normalize();
      return { cpg, k, base, head: base.clone().add(out.multiplyScalar(0.38)) };
    });
    return { strands, sites };
  }, [cpgs]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < PAIRS; i++) {
      const a = strandPoint(i, 0);
      const b = strandPoint(i, GROOVE);
      const mid = a.clone().lerp(b, 0.5);
      rungs.current!.setMatrixAt(2 * i, segment(a, mid, 0.03, m));
      rungs.current!.setMatrixAt(2 * i + 1, segment(mid, b, 0.03, m));
      const even = i % 2 === 0;
      rungs.current!.setColorAt(2 * i, color.set(even ? "#5b5f6b" : "#3e414a"));
      rungs.current!.setColorAt(2 * i + 1, color.set(even ? "#3e414a" : "#5b5f6b"));
      nodes.current!.setMatrixAt(2 * i, m.makeTranslation(a.x, a.y, a.z));
      nodes.current!.setMatrixAt(2 * i + 1, m.makeTranslation(b.x, b.y, b.z));
    }
    rungs.current!.instanceMatrix.needsUpdate = true;
    rungs.current!.instanceColor!.needsUpdate = true;
    nodes.current!.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, dt) => {
    if (spin.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) spin.current.rotation.y += dt * 0.25;
    sites.forEach((site, i) => {
      const target = betas ? betas[site.k] : 0.5;
      const next = THREE.MathUtils.lerp((shown.current[i] ??= target), target, 0.1);
      shown.current[i] = next;
      const mesh = methyls.current[i];
      if (!mesh) return;
      mesh.scale.setScalar(0.04 + 0.18 * next);
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + 4 * next * next;
    });
  });

  return (
    <group rotation={[0, 0, -0.35]}>
      <group ref={spin}>
        {strands.map((geometry, i) => (
          <mesh key={i} geometry={geometry}>
            <meshStandardMaterial color="#d9dce3" roughness={0.35} metalness={0.3} />
          </mesh>
        ))}
        <instancedMesh ref={rungs} args={[undefined, undefined, PAIRS * 2]}>
          <cylinderGeometry args={[1, 1, 1, 8]} />
          <meshStandardMaterial roughness={0.6} />
        </instancedMesh>
        <instancedMesh ref={nodes} args={[undefined, undefined, PAIRS * 2]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshStandardMaterial color="#eef0f4" roughness={0.3} />
        </instancedMesh>
        {sites.map((site, i) => {
          const color = site.cpg.r > 0 ? GAIN : LOSS;
          return (
            <group key={site.cpg.cpg}>
              <mesh matrix={segment(site.base, site.head, 0.015, new THREE.Matrix4())} matrixAutoUpdate={false}>
                <cylinderGeometry args={[1, 1, 1, 6]} />
                <meshBasicMaterial color={color} transparent opacity={0.6} />
              </mesh>
              <mesh ref={(el) => { methyls.current[i] = el; }} position={site.head}>
                <sphereGeometry args={[1, 20, 20]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} toneMapped={false} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

export default function HelixScene({ cpgs, betas }: { cpgs: Cpg[]; betas: number[] | null }) {
  return (
    <Canvas camera={{ position: [4, 1.5, 15], fov: 40 }} dpr={[1, 2]} gl={{ alpha: true }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} />
      <pointLight position={[-4, -2, 3]} intensity={25} color="#ffb27a" />
      <Helix cpgs={cpgs} betas={betas} />
      <Grid position={[0, -6.4, 0]} args={[30, 30]} cellSize={0.6} cellColor="#1d1f25" sectionSize={3} sectionColor="#2a2d35" fadeDistance={22} infiniteGrid />
      <OrbitControls enablePan={false} enableZoom={false} />
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.65} />
      </EffectComposer>
    </Canvas>
  );
}

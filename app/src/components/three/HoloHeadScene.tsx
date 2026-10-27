"use client";

import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, Noise, Scanline } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// Tête : « Infinite, 3D Head Scan » de Lee Perry-Smith, CC BY 3.0 (voir public/models/head_LICENSE.txt).
// C'est un avatar générique : il illustre un âge, ce n'est jamais le visage de la personne analysée.
const HEAD_URL = "/models/head.glb";

export type HoloView = "face" | "trois-quarts" | "profil" | "rotation";

const VIEW_ANGLE: Record<Exclude<HoloView, "rotation">, number> = {
  face: 0,
  "trois-quarts": -0.65,
  profil: -Math.PI / 2,
};

const COMMON = /* glsl */ `
  uniform float uTime;
  uniform float uAge;
  uniform float uScan;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPixelRatio;
  varying vec3 vPos;
  varying vec3 vNormalV;
  varying vec3 vView;
  varying float vAging;

  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
  }
`;

// Repères du buste normalisé (hauteur 2, mesurés sur le modèle) : menton y ≈ 0,05, bout du nez y ≈ 0,28 (z = 0,65),
// yeux y ≈ 0,43, front de 0,55 à 0,8. Le bas du visage s'affaisse avec l'âge, et quelques tranches « décrochent ».
const VERTEX = /* glsl */ `
  ${COMMON}
  void main() {
    vec3 p = position;
    float aging = smoothstep(20.0, 90.0, uAge);
    float front = smoothstep(0.25, 0.5, p.z);
    float jaw = smoothstep(0.34, 0.08, p.y) * smoothstep(-0.12, 0.06, p.y);
    p.y -= aging * 0.05 * jaw * front;
    p.z -= aging * 0.025 * jaw * front;

    float slice = floor(p.y * 30.0);
    float tick = floor(uTime * 6.0);
    p.x += step(0.985, hash(slice + tick)) * 0.05 * (hash(slice * 3.1 + tick) - 0.5);

    vPos = p;
    vAging = aging;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = normalize(-mv.xyz);
    #ifdef POINTS
      gl_PointSize = 1.7 * uPixelRatio * (6.0 / -mv.z);
    #endif
    gl_Position = projectionMatrix * mv;
  }
`;

// Hologramme : contour lumineux (Fresnel), lignes de balayage, et rides qui s'allument avec l'âge :
// front, pattes d'oie, sillons nez-bouche et plis du cou.
const FRAGMENT = /* glsl */ `
  ${COMMON}
  float segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vView))), 2.6);
    float scan = 0.6 + 0.4 * sin(vPos.y * 140.0 - uTime * 5.0);
    float face = smoothstep(0.28, 0.42, vPos.z);
    float ax = abs(vPos.x);

    float fore = smoothstep(0.55, 0.6, vPos.y) * smoothstep(0.8, 0.72, vPos.y) * smoothstep(0.3, 0.1, ax) * face;
    float foreLines = pow(abs(sin(vPos.y * 90.0 + noise(vPos.xz * 8.0) * 1.4)), 6.0) * fore;

    vec2 eye = vec2(ax - 0.3, vPos.y - 0.43);
    float crow = pow(abs(sin(atan(eye.y, eye.x) * 5.0)), 6.0) * smoothstep(0.14, 0.03, length(eye)) * step(0.0, eye.x)
               * smoothstep(0.15, 0.3, vPos.z);

    float fold = smoothstep(0.022, 0.0, segment(vec2(ax, vPos.y), vec2(0.075, 0.25), vec2(0.15, 0.1))) * face;

    float neck = smoothstep(-0.28, -0.22, vPos.y) * smoothstep(-0.02, -0.08, vPos.y) * smoothstep(0.15, 0.3, vPos.z);
    float neckLines = pow(abs(sin(vPos.y * 70.0)), 6.0) * neck;

    float wrinkles = (foreLines + crow + fold + neckLines * 0.7) * vAging;
    float grain = noise(vPos.xy * 70.0) * vAging * 0.25 * step(-0.3, vPos.y);
    float sweep = smoothstep(0.05, 0.0, abs(vPos.y - uScan));
    float flicker = 0.93 + 0.07 * hash(floor(uTime * 20.0));

    vec3 col = uColor * (0.2 + min(fres, 0.7) * 1.1 + grain) * scan + (uColor * 1.5 + 0.8) * wrinkles + vec3(1.0) * sweep;
    float alpha = (0.08 + min(fres, 0.7) * 0.55 + wrinkles * 1.3 + sweep * 0.8) * uOpacity * flicker;
    gl_FragColor = vec4(col, alpha);
  }
`;

const POINTS_FRAGMENT = /* glsl */ `
  ${COMMON}
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    float sweep = smoothstep(0.06, 0.0, abs(vPos.y - uScan));
    gl_FragColor = vec4(uColor + sweep, (0.2 + sweep) * uOpacity);
  }
`;

function useHeadGeometry() {
  const gltf = useGLTF(HEAD_URL);
  return useMemo(() => {
    let mesh: THREE.Mesh | undefined;
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    // Recentrée et ramenée à une hauteur de 2 : les zones du shader (front, yeux, mâchoire) sont en coordonnées normalisées.
    const g = mesh!.geometry.clone();
    g.center();
    g.computeBoundingBox();
    const h = g.boundingBox!.max.y - g.boundingBox!.min.y;
    g.scale(2 / h, 2 / h, 2 / h);
    return g;
  }, [gltf]);
}

function makeUniforms(color: string, opacity: number) {
  return {
    uTime: { value: 0 },
    uAge: { value: 40 },
    uScan: { value: -5 },
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
    uPixelRatio: { value: 1 },
  };
}

type HeadProps = { x: number; age: number; color: string; opacity: number; scanKey: string; view: HoloView };

function HoloHead({ x, age, color, opacity, scanKey, view }: HeadProps) {
  const geometry = useHeadGeometry();
  const group = useRef<THREE.Group>(null);
  // Uniformes créés une fois, puis mis à jour image par image via les matériaux.
  const [surface] = useState(() => makeUniforms(color, opacity));
  const [points] = useState(() => makeUniforms(color, opacity));
  const surfaceMat = useRef<THREE.ShaderMaterial>(null);
  const pointsMat = useRef<THREE.ShaderMaterial>(null);
  const shownAge = useRef(age);
  const scan = useRef(-5);

  // Chaque changement de personne relance un balayage de haut en bas.
  useEffect(() => {
    scan.current = 1.3;
  }, [scanKey]);

  useFrame((state, dt) => {
    shownAge.current = THREE.MathUtils.lerp(shownAge.current, age, 0.06);
    if (scan.current > -1.3) scan.current -= dt * 1.6;
    const target = new THREE.Color(color);
    for (const mat of [surfaceMat.current, pointsMat.current]) {
      if (!mat) continue;
      const u = mat.uniforms;
      u.uTime.value = state.clock.elapsedTime;
      u.uAge.value = shownAge.current;
      u.uScan.value = scan.current;
      u.uColor.value.lerp(target, 0.08);
      u.uPixelRatio.value = state.gl.getPixelRatio();
    }
    if (!group.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (view === "rotation") {
      if (!reduced) group.current.rotation.y += dt * 0.35;
    } else {
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, VIEW_ANGLE[view], 0.06);
    }
    group.current.position.y = 0.1 + Math.sin(state.clock.elapsedTime * 1.2 + x) * 0.03;
  });

  return (
    <group position={[x, 0, 0]}>
      <group ref={group}>
        <mesh geometry={geometry}>
          <shaderMaterial ref={surfaceMat} vertexShader={VERTEX} fragmentShader={FRAGMENT} uniforms={surface} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <points geometry={geometry}>
          <shaderMaterial ref={pointsMat} vertexShader={VERTEX} fragmentShader={POINTS_FRAGMENT} uniforms={points} defines={{ POINTS: "" }} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      </group>
      <Projector color={color} />
    </group>
  );
}

const CONE_VERTEX = /* glsl */ `
  varying float vY;
  varying vec2 vUv;
  void main() {
    vY = position.y;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CONE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying float vY;
  varying vec2 vUv;
  void main() {
    float fade = smoothstep(1.4, -1.3, vY);
    float rays = 0.6 + 0.4 * sin(vUv.x * 80.0 + uTime * 0.8);
    gl_FragColor = vec4(uColor, fade * 0.08 * rays);
  }
`;

/** Socle de projection : disque gradué, anneaux et cône de lumière. */
function Projector({ color }: { color: string }) {
  const ring = useRef<THREE.Group>(null);
  const [cone] = useState(() => ({ uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } }));
  const coneMat = useRef<THREE.ShaderMaterial>(null);
  const ticks = useMemo(() => Array.from({ length: 48 }, (_, i) => (i / 48) * Math.PI * 2), []);

  useFrame((state) => {
    if (coneMat.current) {
      coneMat.current.uniforms.uTime.value = state.clock.elapsedTime;
      coneMat.current.uniforms.uColor.value.lerp(new THREE.Color(color), 0.08);
    }
    if (ring.current) ring.current.rotation.y = state.clock.elapsedTime * 0.25;
  });

  return (
    <group position={[0, -1.25, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.95, 64]} />
        <meshBasicMaterial color="#0d1016" transparent opacity={0.9} />
      </mesh>
      {[0.95, 0.78, 0.5].map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005 * (i + 1), 0]}>
          <ringGeometry args={[r - 0.012, r, 96]} />
          <meshBasicMaterial color={color} transparent opacity={i === 0 ? 0.9 : 0.35} toneMapped={false} />
        </mesh>
      ))}
      <group ref={ring} position={[0, 0.02, 0]}>
        {ticks.map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.86, 0, Math.sin(a) * 0.86]} rotation={[0, -a, 0]}>
            <boxGeometry args={[i % 4 === 0 ? 0.1 : 0.05, 0.01, 0.012]} />
            <meshBasicMaterial color={color} transparent opacity={0.7} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[1.05, 0.9, 2.6, 64, 1, true]} />
        <shaderMaterial ref={coneMat} vertexShader={CONE_VERTEX} fragmentShader={CONE_FRAGMENT} uniforms={cone} transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

type Props = { realAge: number; bioAge: number; sampleKey: string; view: HoloView };

export default function HoloHeadScene({ realAge, bioAge, sampleKey, view }: Props) {
  const bioColor = bioAge >= realAge ? "#ff8a63" : "#5ef0c0";
  return (
    <Canvas camera={{ position: [0, 0.2, 7.7], fov: 36 }} dpr={[1, 2]} gl={{ antialias: true }}>
      {/* Fond opaque : sans lui, le grain et les lignes du post-traitement teintent tout le panneau. */}
      <color attach="background" args={["#0c0d10"]} />
      <HoloHead x={-1.2} age={realAge} color="#9fb3c8" opacity={0.55} scanKey={sampleKey} view={view} />
      <HoloHead x={1.2} age={bioAge} color={bioColor} opacity={1} scanKey={sampleKey} view={view} />
      <EffectComposer>
        <Bloom mipmapBlur levels={5} radius={0.55} intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.25} />
        <ChromaticAberration offset={[0.0012, 0.0008]} radialModulation={false} modulationOffset={0} />
        <Scanline density={1.6} opacity={0.08} />
        <Noise opacity={0.025} />
      </EffectComposer>
    </Canvas>
  );
}

useGLTF.preload(HEAD_URL);

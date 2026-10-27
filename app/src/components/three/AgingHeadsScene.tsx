"use client";

import { Environment, Lightformer, useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// Tête : « Infinite, 3D Head Scan » de Lee Perry-Smith, CC BY 3.0 (voir public/models/head_LICENSE.txt).
// C'est un avatar générique : il illustre un âge, ce n'est jamais le visage de la personne analysée.
const HEAD_URL = "/models/head.glb";
const COLOR_URL = "/models/head_color.jpg";
const NORMAL_URL = "/models/head_normal.jpg";

export type HeadView = "face" | "trois-quarts" | "profil" | "rotation";

const VIEW_ANGLE: Record<Exclude<HeadView, "rotation">, number> = {
  face: 0,
  "trois-quarts": -0.6,
  profil: -Math.PI / 2,
};

// Le vieillissement est injecté dans le matériau physique de three.js.
// Les zones sont repérées en pixels de la texture de peau (1024 × 1024, visage de face, origine en haut à gauche) :
// yeux (440, 300) et (585, 300), front y 130–245, bas du nez y 410, commissures (455, 485) et (565, 485), cou y 660–780.
const AGING_FUNCTIONS = /* glsl */ `
  uniform float uAge;
  float epiHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float epiNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(epiHash(i), epiHash(i + vec2(1, 0)), f.x), mix(epiHash(i + vec2(0, 1)), epiHash(i + vec2(1, 1)), f.x), f.y);
  }
  float epiBand(float v, float a, float b, float soft) { return smoothstep(a, a + soft, v) * smoothstep(b, b - soft, v); }
  float epiLine(vec2 p, vec2 a, vec2 b, float w) {
    vec2 pa = p - a, ba = b - a;
    return smoothstep(w, 0.0, length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)));
  }
  // Pattes d'oie : éventail de plis vers l'extérieur de l'œil.
  float epiCrow(vec2 p, vec2 corner, float dir) {
    vec2 d = (p - corner) * vec2(dir, 1.0);
    float fan = smoothstep(0.65, 1.0, abs(sin(atan(d.y, d.x) * 6.0)));
    return fan * smoothstep(48.0, 10.0, length(d)) * step(0.0, d.x);
  }
  // Champ de plis entre 0 et 1, en pixels de texture.
  float epiCreases(vec2 px) {
    float fore = epiBand(px.y, 135.0, 240.0, 25.0) * epiBand(px.x, 380.0, 645.0, 40.0);
    float c = fore * smoothstep(0.55, 1.0, sin(px.y * 0.3 + sin(px.x * 0.025) * 1.8)) * smoothstep(0.25, 0.65, epiNoise(px * 0.03));
    c += smoothstep(0.75, 1.0, sin(px.x * 0.45)) * epiBand(px.y, 225.0, 262.0, 8.0) * epiBand(px.x, 492.0, 530.0, 6.0) * 0.8;
    c += epiCrow(px, vec2(398.0, 302.0), -1.0) + epiCrow(px, vec2(627.0, 302.0), 1.0);
    vec2 bag = (px - vec2(px.x < 512.0 ? 440.0 : 585.0, 322.0)) / vec2(34.0, 13.0);
    c += smoothstep(0.25, 0.0, abs(length(bag) - 1.0)) * step(0.0, bag.y) * 0.8;
    c += epiLine(px, vec2(466.0, 405.0), vec2(447.0, 494.0), 4.0) + epiLine(px, vec2(556.0, 405.0), vec2(574.0, 494.0), 4.0);
    c += 0.7 * (epiLine(px, vec2(452.0, 492.0), vec2(462.0, 548.0), 3.5) + epiLine(px, vec2(569.0, 492.0), vec2(558.0, 548.0), 3.5));
    c += epiBand(px.y, 660.0, 790.0, 20.0) * epiBand(px.x, 380.0, 645.0, 40.0) * smoothstep(0.6, 1.0, sin(px.y * 0.16)) * smoothstep(0.3, 0.7, epiNoise(px * 0.025)) * 0.6;
    return clamp(c, 0.0, 1.0);
  }
`;

function useAgingMaterial(map: THREE.Texture, normalMap: THREE.Texture) {
  return useMemo(() => {
    const material = new THREE.MeshPhysicalMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.58,
      sheen: 0.25,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color("#ffd9c7"),
    });
    const uniforms = { uAge: { value: 40 } };
    material.userData.uniforms = uniforms;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uAge = uniforms.uAge;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uAge;")
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `#include <begin_vertex>
          // Affaissement : bajoues et menton descendent un peu (buste normalisé, menton y ≈ 0,05).
          float epiAging = smoothstep(25.0, 90.0, uAge);
          float epiJaw = smoothstep(0.34, 0.08, transformed.y) * smoothstep(-0.12, 0.06, transformed.y) * smoothstep(0.25, 0.5, transformed.z);
          transformed.y -= epiAging * 0.065 * epiJaw;
          transformed.z -= epiAging * 0.025 * epiJaw;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${AGING_FUNCTIONS}`)
        .replace(
          "#include <map_fragment>",
          /* glsl */ `#include <map_fragment>
          vec2 epiPx = vec2(vMapUv.x, 1.0 - vMapUv.y) * 1024.0;
          float epiAging = smoothstep(25.0, 85.0, uAge);
          float epiCrease = epiCreases(epiPx) * epiAging;
          float epiLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          // Poils (barbe, sourcils) : les pixels sombres. Avant 25 ans la barbe s'efface, après 40 ans tout grisonne.
          float epiHair = smoothstep(0.42, 0.22, epiLum);
          float epiBeard = epiHair * smoothstep(380.0, 420.0, epiPx.y);
          float epiYouth = smoothstep(28.0, 15.0, uAge);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.69, 0.61), epiBeard * epiYouth * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.04, 0.99, 0.97) + 0.03, epiYouth * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.81, 0.79), epiHair * smoothstep(40.0, 85.0, uAge) * 0.85);
          // Teint plus terne et légèrement jauni.
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(epiLum) * vec3(1.06, 1.0, 0.9), epiAging * 0.3);
          // Taches de vieillesse sur le front, les tempes et les joues.
          float epiSpots = smoothstep(0.8, 0.88, epiNoise(epiPx * 0.045)) * epiBand(epiPx.y, 120.0, 560.0, 60.0) * smoothstep(55.0, 90.0, uAge);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.58, 0.46), epiSpots * 0.55);
          // Les plis assombrissent la peau.
          diffuseColor.rgb *= 1.0 - epiCrease * 0.28;`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          /* glsl */ `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.78, epiAging * 0.5);`,
        );
    };
    return material;
  }, [map, normalMap]);
}

function useHeadGeometry() {
  const gltf = useGLTF(HEAD_URL);
  return useMemo(() => {
    let mesh: THREE.Mesh | undefined;
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    // Recentrée et ramenée à une hauteur de 2 : l'affaissement de la mâchoire est réglé en coordonnées normalisées.
    const g = mesh!.geometry.clone();
    g.center();
    g.computeBoundingBox();
    const h = g.boundingBox!.max.y - g.boundingBox!.min.y;
    g.scale(2 / h, 2 / h, 2 / h);
    return g;
  }, [gltf]);
}

type HeadProps = { x: number; age: number; accent: string; scanKey: string; view: HeadView };

function AgingHead({ x, age, accent, scanKey, view }: HeadProps) {
  const geometry = useHeadGeometry();
  const [map, normalMap] = useTexture([COLOR_URL, NORMAL_URL], ([color]) => {
    color.colorSpace = THREE.SRGBColorSpace;
    color.anisotropy = 8;
  });
  const material = useAgingMaterial(map, normalMap);
  const head = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  const scanRing = useRef<THREE.Mesh>(null);
  const rim = useRef<THREE.PointLight>(null);
  const shownAge = useRef(age);
  const scan = useRef(-2);

  // Chaque changement de personne relance un anneau de balayage, de haut en bas.
  useEffect(() => {
    scan.current = 1.15;
  }, [scanKey]);

  useFrame((state, dt) => {
    shownAge.current = THREE.MathUtils.lerp(shownAge.current, age, 0.06);
    const mat = head.current?.material as THREE.MeshPhysicalMaterial | undefined;
    if (mat) mat.userData.uniforms.uAge.value = shownAge.current;
    if (scan.current > -1.2) scan.current -= dt * 1.4;
    if (scanRing.current) {
      scanRing.current.position.y = scan.current;
      scanRing.current.visible = scan.current > -1.2;
    }
    rim.current?.color.lerp(new THREE.Color(accent), 0.08);
    if (!group.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (view === "rotation") {
      if (!reduced) group.current.rotation.y += dt * 0.3;
    } else {
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, VIEW_ANGLE[view], 0.06);
    }
  });

  return (
    <group position={[x, 0, 0]}>
      <group ref={group}>
        <mesh ref={head} geometry={geometry} material={material} />
      </group>
      {/* Lumière de contour à la couleur de l'écart : corail si l'horloge avance, vert d'eau si elle retarde. */}
      <pointLight ref={rim} position={[0, 0.8, -1.6]} intensity={9} distance={5} color={accent} />
      <mesh ref={scanRing} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.98, 1.0, 96]} />
        <meshBasicMaterial color={accent} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <Pedestal accent={accent} />
    </group>
  );
}

/** Socle lumineux discret : la seule touche « hologramme » qui reste. */
function Pedestal({ accent }: { accent: string }) {
  const ticks = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ticks.current) ticks.current.rotation.y = state.clock.elapsedTime * 0.2;
  });
  const marks = useMemo(() => Array.from({ length: 48 }, (_, i) => (i / 48) * Math.PI * 2), []);
  return (
    <group position={[0, -1.02, 0]}>
      <mesh>
        <cylinderGeometry args={[1.0, 1.08, 0.08, 64]} />
        <meshStandardMaterial color="#121419" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.042, 0]}>
        <ringGeometry args={[0.97, 1.0, 96]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <group ref={ticks} position={[0, 0.045, 0]}>
        {marks.map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.88, 0, Math.sin(a) * 0.88]} rotation={[0, -a, 0]}>
            <boxGeometry args={[i % 4 === 0 ? 0.09 : 0.045, 0.005, 0.01]} />
            <meshBasicMaterial color={accent} transparent opacity={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

type Props = { realAge: number; bioAge: number; sampleKey: string; view: HeadView };

export default function AgingHeadsScene({ realAge, bioAge, sampleKey, view }: Props) {
  const accent = bioAge >= realAge ? "#ff8a63" : "#5ef0c0";
  return (
    <Canvas camera={{ position: [0, 0.3, 6.0], fov: 34 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#0c0d10"]} />
      {/* Éclairage studio entièrement local : pas de fichier HDR à télécharger. */}
      <Environment resolution={256}>
        <Lightformer intensity={2.2} position={[2.5, 2, 3]} scale={[3, 3, 1]} color="#fff1e6" />
        <Lightformer intensity={0.9} position={[-3, 0.5, 2]} scale={[2, 4, 1]} color="#dfe8ff" />
        <Lightformer intensity={0.6} position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
      </Environment>
      <directionalLight position={[2.5, 3, 4]} intensity={1.1} color="#fff3ea" />
      <AgingHead x={-1.15} age={realAge} accent="#9fb3c8" scanKey={sampleKey} view={view} />
      <AgingHead x={1.15} age={bioAge} accent={accent} scanKey={sampleKey} view={view} />
      <EffectComposer>
        <Bloom mipmapBlur levels={5} radius={0.5} intensity={0.6} luminanceThreshold={0.97} />
      </EffectComposer>
    </Canvas>
  );
}

useGLTF.preload(HEAD_URL);

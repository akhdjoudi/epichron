"use client";

import { useCallback, useEffect, useState } from "react";

const STEPS: { target: string; title: string; text: string }[] = [
  {
    target: "panel-genome",
    title: "Le génome",
    text: "Les 23 chromosomes, à l'échelle. Chaque point lumineux est l'un des 249 endroits de l'ADN que l'horloge lit. Corail : il se méthyle en vieillissant. Vert d'eau : il se déméthyle.",
  },
  {
    target: "panel-controls",
    title: "Choisis une personne",
    text: "60 personnes d'une cohorte suédoise que le modèle n'a jamais vue pendant son apprentissage. Fais glisser la règle d'âge ou essaie les préréglages : plus âgé, avance maximale…",
  },
  {
    target: "panel-rings",
    title: "Les cernes de l'ADN",
    text: "Comme un tronc d'arbre : un cerne par décennie, de 10 ans au centre à 90 ans au bord. En allant vers l'écorce, une moitié s'allume et l'autre s'éteint : c'est ce rythme que l'horloge a appris. Les anneaux marquent l'âge civil (blanc) et biologique (ambre).",
  },
  {
    target: "panel-agemap",
    title: "Le modèle est-il fiable ?",
    text: "Chaque point est une personne jamais vue. Sur la diagonale, l'horloge tombe juste. En moyenne, elle se trompe de 3 ans. Le viseur ambre suit la personne choisie.",
  },
  {
    target: "panel-why",
    title: "Pourquoi cet âge ?",
    text: "Les sites qui ont le plus vieilli ou rajeuni cette personne, comparée à quelqu'un de son âge. Le modèle n'est pas une boîte noire : chaque année se lit site par site.",
  },
];

const CARD_W = 300;

export default function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    const el = document.getElementById(STEPS[step].target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(STEPS[step].target)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // Mesure à l'image suivante, puis une fois le défilement terminé.
    const raf = requestAnimationFrame(measure);
    const t = setTimeout(measure, 400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, onClose, measure]);

  if (!open || !rect) return null;

  const { title, text } = STEPS[step];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // La carte se place à droite du panneau éclairé, sinon à gauche, sinon par-dessus en bas.
  const left = rect.right + 16 + CARD_W < vw ? rect.right + 16 : rect.left - 16 - CARD_W > 0 ? rect.left - 16 - CARD_W : Math.max(16, vw - CARD_W - 16);
  const top = Math.min(Math.max(16, rect.top + 24), vh - 240);
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Visite guidée : ${title}`}>
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="pointer-events-none absolute rounded-[4px] border border-amber shadow-[0_0_0_100vmax_rgba(0,0,0,0.72)] transition-all duration-300"
        style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
      />
      <div className="absolute rounded-[4px] border border-line-strong bg-panel p-4 shadow-2xl" style={{ left, top, width: CARD_W }}>
        <p className="label">
          Visite guidée · {step + 1}/{STEPS.length}
        </p>
        <h3 className="mt-2 text-base text-ink">{title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{text}</p>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={onClose} className="text-[12px] text-ink-3 hover:text-ink">
            Passer
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="rounded-[3px] border border-line-strong px-3 py-1 text-[12px] text-ink-2 hover:text-ink">
                Précédent
              </button>
            )}
            <button
              onClick={() => (last ? onClose() : setStep(step + 1))}
              className="rounded-[3px] border border-amber/80 bg-amber/10 px-3 py-1 text-[12px] text-amber hover:bg-amber/20"
              autoFocus
            >
              {last ? "Terminer" : "Suivant"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { fmt1, type Marker, type Metrics, type Shap, type SplitMetrics } from "@/lib/clock";
import KeyGenes from "./KeyGenes";
import Markers from "./Markers";
import { Panel } from "./ui";

const MODELS: [string, string][] = [
  ["elasticnet", "ElasticNet"],
  ["lightgbm", "LightGBM"],
];
const SPLITS: [string, string][] = [
  ["test", "Test interne · GSE40279"],
  ["external", "Externe · GSE87571"],
];

const STEPS = [
  ["01", "Données", "Deux cohortes GEO de sang total sur puce Illumina 450K : Hannum (entraînement) et Johansson (validation externe)."],
  ["02", "Nettoyage", "Sites communs aux deux puces, moins de 5 % de valeurs manquantes, imputation par la médiane du train."],
  ["03", "Présélection", "Les 20 000 sites les plus corrélés à l'âge, calculés sur le split train seulement pour éviter toute fuite."],
  ["04", "Modèles", "ElasticNet validé croisé sur la transformation d'âge de Horvath, puis LightGBM pour les effets non linéaires."],
  ["05", "Navigateur", "Les poids de l'ElasticNet sont exportés en JSON : l'âge se recalcule ici, sans serveur."],
];

export default function Report({ metrics, markers, shap }: { metrics: Metrics; markers: Marker[]; shap: Shap }) {
  return (
    <div id="rapport" className="grid gap-2 p-2 pt-0 lg:grid-cols-[1fr_1.6fr]">
      <div className="grid gap-2">
        <Panel title="Rapport · performances">
          <div className="overflow-x-auto p-3">
            <table className="num w-full text-[12px]">
              <thead>
                <tr className="label text-left">
                  <th className="pb-2 font-normal">Modèle · cohorte</th>
                  <th className="pb-2 text-right font-normal">MAE</th>
                  <th className="pb-2 text-right font-normal">Médiane</th>
                  <th className="pb-2 text-right font-normal">r</th>
                  <th className="pb-2 text-right font-normal">n</th>
                </tr>
              </thead>
              <tbody>
                {MODELS.flatMap(([m, mName]) =>
                  SPLITS.map(([s, sName]) => {
                    const v = metrics[m]?.[s] as SplitMetrics | undefined;
                    if (!v) return null;
                    return (
                      <tr key={m + s} className="border-t border-line">
                        <td className="py-2">
                          <span className="text-ink">{mName}</span>
                          <span className="block text-[10px] text-ink-3">{sName}</span>
                        </td>
                        <td className="py-2 text-right text-amber">{fmt1.format(v.mae)} ans</td>
                        <td className="py-2 text-right text-ink-2">{fmt1.format(v.median_ae)}</td>
                        <td className="py-2 text-right text-ink-2">{v.pearson_r.toFixed(3)}</td>
                        <td className="py-2 text-right text-ink-3">{v.n}</td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
              MAE : erreur absolue moyenne en années. L&apos;horloge ElasticNet garde {String(metrics.elasticnet?.n_cpgs ?? "–")} sites sur 450 000.
              La cohorte externe vient d&apos;un autre laboratoire : l&apos;écart avec le test interne mesure l&apos;effet de lot.
            </p>
          </div>
        </Panel>

        <Panel title="Éthique · limites">
          <ul className="space-y-2 p-3 text-[12px] leading-relaxed text-ink-2">
            <li>Données publiques et anonymisées uniquement. Le site n&apos;accepte jamais d&apos;ADN de visiteur : ce sont des données de santé (RGPD).</li>
            <li>Régression vers la moyenne : le modèle tend à vieillir les plus jeunes et rajeunir les plus âgés.</li>
            <li>Un écart d&apos;âge isolé n&apos;est pas un diagnostic : c&apos;est un indicateur statistique, à lire à l&apos;échelle d&apos;une population.</li>
          </ul>
        </Panel>
      </div>

      <Panel title={`Marqueurs · les ${markers.length} sites les plus corrélés à l'âge`}>
        <Markers markers={markers} />
      </Panel>

      <Panel title="Gènes clés · ce qui porte l'âge prédit" className="lg:col-span-2">
        <KeyGenes shap={shap} />
      </Panel>

      <Panel title="Méthode" className="lg:col-span-2">
        <ol id="methode" className="grid gap-px bg-line sm:grid-cols-5">
          {STEPS.map(([n, title, text]) => (
            <li key={n} className="bg-panel p-4">
              <p className="num text-[11px] text-amber">{n}</p>
              <p className="mt-2 text-sm text-ink">{title}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">{text}</p>
            </li>
          ))}
        </ol>
      </Panel>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-2 py-4 text-[11px] text-ink-3 lg:col-span-2">
        <span>EpiChron · horloge épigénétique · projet portfolio</span>
        <span className="flex gap-4">
          <a href="https://github.com/akhdjoudi" className="hover:text-ink">@akhdjoudi</a>
          <a href="https://github.com/aymenblk04" className="hover:text-ink">@aymenblk04</a>
          <a href="https://github.com/akhdjoudi/epichron" className="hover:text-ink">Code source</a>
        </span>
      </footer>
    </div>
  );
}

import { fmt1, type Shap, type ShapGene } from "@/lib/clock";

const TOP = 10;
const MODELS = [
  ["elasticnet", "ElasticNet"],
  ["lightgbm", "LightGBM"],
] as const;

function Column({ name, genes, shared, max }: { name: string; genes: ShapGene[]; shared: Set<string>; max: number }) {
  return (
    <div className="p-3">
      <p className="label mb-2">{name}</p>
      <ul className="space-y-1.5">
        {genes.map((g) => (
          <li key={g.gene} className="flex items-center gap-2">
            <span className={`w-16 truncate text-[11px] ${shared.has(g.gene) ? "text-ink" : "text-ink-2"}`}>{g.gene}</span>
            <div className="h-2.5 flex-1">
              <div className={`h-full rounded-[2px] ${shared.has(g.gene) ? "bg-amber" : "bg-line-strong"}`} style={{ width: `${(g.mean_abs_years / max) * 100}%` }} />
            </div>
            <span className="num w-12 text-right text-[11px] text-ink">{fmt1.format(g.mean_abs_years)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Gènes clés : les deux modèles côte à côte, en ambre ceux qui sont dans le top des deux. Valeurs SHAP calculées en Python. */
export default function KeyGenes({ shap }: { shap: Shap }) {
  const top = (m: (typeof MODELS)[number][0]) => shap[m].genes.slice(0, TOP);
  const [a, b] = [top("elasticnet"), top("lightgbm")];
  const shared = new Set(a.map((g) => g.gene).filter((g) => b.some((x) => x.gene === g)));
  const max = Math.max(...a.map((g) => g.mean_abs_years), ...b.map((g) => g.mean_abs_years));

  return (
    <div>
      <div className="grid gap-px sm:grid-cols-2">
        {MODELS.map(([m, name]) => (
          <Column key={m} name={name} genes={top(m)} shared={shared} max={max} />
        ))}
      </div>
      <p className="px-3 pb-3 text-[11px] leading-relaxed text-ink-3">
        Poids moyen de chaque gène sur l&apos;âge prédit, en années, mesuré sur les {shap.n} personnes de la cohorte externe (SHAP).{" "}
        <span className="text-amber">Ambre</span> : gène dans le top {TOP} des deux modèles.
      </p>
    </div>
  );
}

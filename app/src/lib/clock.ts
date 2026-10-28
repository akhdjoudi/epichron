// Types du contrat de données (README, section « Fichiers échangés entre A et B ») et calcul de l'horloge.

export type Cpg = {
  cpg: string;
  weight: number;
  gene: string | null;
  chromosome: string | null;
  position: number | null;
  /** Corrélation avec l'âge sur l'entraînement : > 0, le site se méthyle en vieillissant. */
  r: number;
  /** Droite bêta = a + b × âge, ajustée sur l'entraînement. */
  trend: [number, number];
};

export type Weights = {
  version: number;
  model: string;
  trained_on: string;
  intercept: number;
  age_transform: { type: "horvath"; adult_age: number };
  cpgs: Cpg[];
};

export type Sample = {
  gsm: string;
  age: number;
  sex: "F" | "M" | null;
  betas: number[];
  /** Âge prédit par LightGBM, calculé en Python : le modèle est trop lourd pour le navigateur. */
  lightgbm: number;
};

/** Méthylation moyenne de chaque site de l'horloge pour une décennie d'âge (ordre de cpg_weights). */
export type Ring = { decade: number; n: number; betas: number[] };

export type Marker = { cpg: string; gene: string | null; r: number; points: [number, number][] };

export type ShapGene = { gene: string; mean_abs_years: number; n_sites: number };

/** Gènes qui pèsent le plus sur l'âge prédit (SHAP), par modèle, sur la cohorte externe. */
export type Shap = { n: number; elasticnet: { genes: ShapGene[] }; lightgbm: { genes: ShapGene[] } };

export type SplitMetrics = { mae: number; median_ae: number; pearson_r: number; n: number };

export type Metrics = Record<string, Record<string, SplitMetrics | number>>;

export type Prediction = {
  gsm: string;
  dataset: string;
  split: "train" | "test" | "external";
  sex: "F" | "M" | null;
  age: number;
  predicted_age: number;
  acceleration: number;
};

/** F⁻¹ de Horvath : retour de l'échelle transformée vers des années. */
export function inverseTransformAge(y: number, adultAge = 20): number {
  return y <= 0 ? Math.exp(y + Math.log(adultAge + 1)) - 1 : y * (adultAge + 1) + adultAge;
}

/** Âge épigénétique = F⁻¹(intercept + Σ poids × bêta). Identique à epichron.export.browser_predict. */
export function predictAge(weights: Weights, betas: number[]): number {
  let y = weights.intercept;
  for (let i = 0; i < weights.cpgs.length; i++) y += weights.cpgs[i].weight * betas[i];
  return inverseTransformAge(y, weights.age_transform.adult_age);
}

/** F de Horvath : des années vers l'échelle sur laquelle l'horloge est linéaire. */
export function transformAge(age: number, adultAge = 20): number {
  return age <= adultAge ? Math.log(age + 1) - Math.log(adultAge + 1) : (age - adultAge) / (adultAge + 1);
}

export type Contribution = { cpg: Cpg; years: number };

/**
 * Décompose l'écart entre l'âge prédit et l'âge « typique » qu'aurait une personne de même âge civil
 * (bêtas sur la droite de tendance de chaque site). Le modèle étant linéaire sur F(âge), chaque site
 * apporte poids × (bêta − bêta attendu) ; on répartit ensuite l'écart en années au prorata.
 */
export function explainAge(weights: Weights, betas: number[], age: number) {
  const adult = weights.age_transform.adult_age;
  let yRef = weights.intercept;
  let yPred = weights.intercept;
  const raw = weights.cpgs.map((c, i) => {
    const expected = expectedBeta(c, age);
    yRef += c.weight * expected;
    yPred += c.weight * betas[i];
    return c.weight * (betas[i] - expected);
  });
  const refAge = inverseTransformAge(yRef, adult);
  const predicted = inverseTransformAge(yPred, adult);
  // Pente locale de F⁻¹ si les deux âges sont confondus.
  const scale = Math.abs(yPred - yRef) > 1e-9 ? (predicted - refAge) / (yPred - yRef) : (inverseTransformAge(yPred + 1e-4, adult) - predicted) / 1e-4;
  const contributions: Contribution[] = weights.cpgs.map((cpg, i) => ({ cpg, years: raw[i] * scale }));
  return { refAge, predicted, contributions };
}

/** Méthylation attendue d'un site à un âge donné, d'après sa droite de tendance. */
export function expectedBeta(cpg: Cpg, age: number): number {
  return Math.min(1, Math.max(0, cpg.trend[0] + cpg.trend[1] * age));
}

export function parsePredictions(csv: string): Prediction[] {
  const [header, ...rows] = csv.trim().split("\n");
  const cols = header.split(",");
  return rows.map((row) => {
    const v = row.split(",");
    const get = (k: string) => v[cols.indexOf(k)];
    return {
      gsm: get("gsm"),
      dataset: get("dataset"),
      split: get("split") as Prediction["split"],
      sex: (get("sex") || null) as Prediction["sex"],
      age: Number(get("age")),
      predicted_age: Number(get("predicted_age")),
      acceleration: Number(get("acceleration")),
    };
  });
}

export const fmt1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

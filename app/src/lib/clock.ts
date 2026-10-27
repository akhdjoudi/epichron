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

export type Marker = { cpg: string; gene: string | null; r: number; points: [number, number][] };

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

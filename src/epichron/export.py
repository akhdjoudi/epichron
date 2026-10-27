"""Export des résultats pour le site web (app/public/data/), selon le contrat du README.

- cpg_weights.json : l'horloge ElasticNet (intercept + poids sur bêtas bruts), sites annotés
- predictions.csv  : âge réel et prédit pour chaque échantillon
- metrics.json     : erreurs par modèle et par split
- samples.json     : bêtas de quelques échantillons externes, pour faire tourner l'horloge dans le navigateur
- markers.json     : nuage âge/bêta des sites les plus liés à l'âge
- rings.json       : méthylation moyenne de chaque site de l'horloge par décennie d'âge (les « cernes »)

Usage : python -m epichron.export
"""

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from epichron.preprocess import age_correlation
from epichron.train import ADULT_AGE, inverse_transform_age

CONTRACT_VERSION = 2
N_DEMO_SAMPLES = 60
N_MARKERS = 6


def browser_predict(weights: dict, betas: list[float]) -> float:
    """Le calcul fait par le site, réécrit en Python pur pour vérifier l'export."""
    y = weights["intercept"] + sum(c["weight"] * b for c, b in zip(weights["cpgs"], betas))
    return float(inverse_transform_age(y))


def age_trend(X: pd.DataFrame, age: pd.Series) -> pd.DataFrame:
    """Droite bêta = a + b × âge pour chaque site : le site s'en sert pour animer la méthylation au fil de l'âge."""
    a_mean = age.mean()
    x = X.to_numpy(np.float64)
    b = ((age.to_numpy() - a_mean)[:, None] * (x - x.mean(axis=0))).sum(axis=0) / ((age - a_mean) ** 2).sum()
    return pd.DataFrame({"a": x.mean(axis=0) - b * a_mean, "b": b}, index=X.columns)


def build_weights(clock, manifest: pd.DataFrame, r: pd.Series, trend: pd.DataFrame) -> dict:
    sites = clock.weights.sort_values(key=np.abs, ascending=False)
    annot = manifest.reindex(sites.index)
    cpgs = [
        {
            "cpg": cpg,
            "weight": float(w),
            "gene": annot.at[cpg, "gene"] if pd.notna(annot.at[cpg, "gene"]) else None,
            "chromosome": annot.at[cpg, "chromosome"] if pd.notna(annot.at[cpg, "chromosome"]) else None,
            "position": int(annot.at[cpg, "position"]) if pd.notna(annot.at[cpg, "position"]) else None,
            "r": round(float(r[cpg]), 3),
            "trend": [round(float(trend.at[cpg, "a"]), 4), round(float(trend.at[cpg, "b"]), 6)],
        }
        for cpg, w in sites.items()
    ]
    return {
        "version": CONTRACT_VERSION,
        "model": "elasticnet",
        "trained_on": "GSE40279",
        "intercept": clock.intercept,
        "age_transform": {"type": "horvath", "adult_age": ADULT_AGE},
        "cpgs": cpgs,
    }


def decade_means(X: pd.DataFrame, age: pd.Series) -> pd.DataFrame:
    """Moyenne de chaque site par décennie d'âge (10 = 10–19 ans… 90 = 90 ans et plus), sur toutes les personnes."""
    decade = (age // 10 * 10).clip(10, 90).astype(int)
    return X.groupby(decade).mean().assign(n=decade.value_counts())


def pick_demo_samples(predictions: pd.DataFrame, n: int, seed: int = 42) -> pd.Index:
    """Échantillons externes répartis sur toute la plage d'âges."""
    external = predictions[predictions.split == "external"].sort_values("age")
    rng = np.random.default_rng(seed)
    picks = [rng.choice(chunk) for chunk in np.array_split(external.index.to_numpy(), n) if len(chunk)]
    return pd.Index(picks)


def main() -> None:
    parser = argparse.ArgumentParser(description="Exporte les fichiers du site.")
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--out", type=Path, default=Path("app/public/data"))
    args = parser.parse_args()

    processed = args.data_dir / "processed"
    X = pd.read_parquet(processed / "features.parquet")
    predictions = pd.read_parquet(processed / "predictions.parquet")
    manifest = pd.read_parquet(args.data_dir / "interim" / "manifest_450k.parquet")
    clock = joblib.load(args.data_dir / "models" / "elasticnet.joblib")
    train = predictions.index[predictions.split == "train"]
    r = age_correlation(X.loc[train], predictions.loc[train, "age"])

    args.out.mkdir(parents=True, exist_ok=True)
    trend = age_trend(X.loc[train, clock.weights.index], predictions.loc[train, "age"])
    weights = build_weights(clock, manifest, r, trend)
    (args.out / "cpg_weights.json").write_text(json.dumps(weights))

    table = predictions.rename(columns={"elasticnet": "predicted_age"})
    table["acceleration"] = table.predicted_age - table.age
    table.index.name = "gsm"
    table = table.reset_index()[["gsm", "dataset", "split", "sex", "age", "predicted_age", "acceleration"]]
    table.round(2).to_csv(args.out / "predictions.csv", index=False)

    (args.out / "metrics.json").write_text((processed / "metrics.json").read_text())

    order = [c["cpg"] for c in weights["cpgs"]]
    demo = pick_demo_samples(predictions, N_DEMO_SAMPLES)
    samples = [
        {
            "gsm": gsm,
            "age": float(predictions.at[gsm, "age"]),
            "sex": predictions.at[gsm, "sex"],
            "betas": [round(float(b), 4) for b in X.loc[gsm, order]],
            "lightgbm": round(float(predictions.at[gsm, "lightgbm"]), 2),
        }
        for gsm in demo
    ]
    for s in samples:
        expected = float(predictions.at[s["gsm"], "elasticnet"])
        assert abs(browser_predict(weights, s["betas"]) - expected) < 0.25, s["gsm"]
    (args.out / "samples.json").write_text(json.dumps({"version": CONTRACT_VERSION, "samples": samples}))

    top = r.abs().sort_values(ascending=False).index[:N_MARKERS]
    markers = [
        {
            "cpg": cpg,
            "gene": manifest.at[cpg, "gene"] if cpg in manifest.index and pd.notna(manifest.at[cpg, "gene"]) else None,
            "r": round(float(r[cpg]), 3),
            "points": [[round(float(a), 1), round(float(b), 3)] for a, b in zip(predictions.loc[train, "age"], X.loc[train, cpg])],
        }
        for cpg in top
    ]
    (args.out / "markers.json").write_text(json.dumps({"version": CONTRACT_VERSION, "markers": markers}))

    means = decade_means(X[order], predictions["age"])
    rings = [
        {"decade": int(d), "n": int(row["n"]), "betas": [round(float(b), 4) for b in row[order]]}
        for d, row in means.iterrows()
    ]
    (args.out / "rings.json").write_text(json.dumps({"version": CONTRACT_VERSION, "rings": rings}))
    print(f"{len(weights['cpgs'])} sites dans l'horloge, {len(samples)} échantillons de démo, export dans {args.out}")


if __name__ == "__main__":
    main()

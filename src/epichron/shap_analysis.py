"""Importance des sites et des gènes par SHAP, sur la cohorte externe (jamais vue à l'entraînement).

Entrée : data/models/*.joblib, data/processed/{features,samples}.parquet, data/interim/manifest_450k.parquet
Sortie : app/public/data/shap.json : par modèle, les sites et les gènes qui pèsent le plus sur l'âge prédit.

SHAP s'exprime dans l'espace de la transformation d'âge de Horvath ; au-dessus de 20 ans, 1 unité vaut
ADULT_AGE + 1 années. On convertit avec ce facteur.
shortcut: conversion exacte seulement pour les adultes (la transformation est logarithmique avant 20 ans), à revoir si on explique surtout des enfants.

Usage : python -m epichron.shap_analysis
"""

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap

from epichron.train import ADULT_AGE

TOP_SITES = 20
TOP_GENES = 15
YEARS_PER_UNIT = ADULT_AGE + 1


def explain(model, X: pd.DataFrame, background: pd.DataFrame) -> pd.DataFrame:
    """SHAP par échantillon et par site, en années. ElasticNet : exact (linéaire) ; LightGBM : arbres."""
    if hasattr(model, "weights"):
        sites = model.weights.index
        explainer = shap.LinearExplainer((model.weights.to_numpy(), model.intercept), background[sites].to_numpy(np.float64))
        values = explainer.shap_values(X[sites].to_numpy(np.float64))
    else:
        sites = model.sites
        values = shap.TreeExplainer(model.model).shap_values(X[sites])
    return pd.DataFrame(values * YEARS_PER_UNIT, index=X.index, columns=sites)


def rank_sites(values: pd.DataFrame, manifest: pd.DataFrame, top: int = TOP_SITES) -> list[dict]:
    """Importance d'un site = |SHAP| moyen, en années d'âge prédit."""
    imp = values.abs().mean().sort_values(ascending=False).head(top)
    return [{"cpg": c, "gene": manifest["gene"].get(c), "mean_abs_years": round(float(v), 3)} for c, v in imp.items()]


def rank_genes(values: pd.DataFrame, manifest: pd.DataFrame, top: int = TOP_GENES) -> list[dict]:
    """Un gène regroupe ses sites : on somme leurs SHAP par personne, puis |moyenne|. Les sites sans gène sont ignorés."""
    gene = manifest["gene"].reindex(values.columns)
    per_gene = values.T.groupby(gene).sum().T
    imp = per_gene.abs().mean().sort_values(ascending=False).head(top)
    n_sites = gene.value_counts()
    return [{"gene": g, "mean_abs_years": round(float(v), 3), "n_sites": int(n_sites[g])} for g, v in imp.items()]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--out", type=Path, default=Path("app/public/data/shap.json"))
    args = parser.parse_args()

    features = pd.read_parquet(args.data_dir / "processed" / "features.parquet")
    samples = pd.read_parquet(args.data_dir / "processed" / "samples.parquet")
    manifest = pd.read_parquet(args.data_dir / "interim" / "manifest_450k.parquet")
    background = features[samples.split == "train"]
    external = features[samples.split == "external"]

    result = {"explained_on": "external", "n": int(len(external)), "unit": "années d'âge prédit"}
    for name in ("elasticnet", "lightgbm"):
        model = joblib.load(args.data_dir / "models" / f"{name}.joblib")
        values = explain(model, external, background)
        result[name] = {"sites": rank_sites(values, manifest), "genes": rank_genes(values, manifest)}
        print(name, [g["gene"] for g in result[name]["genes"][:8]])
    args.out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Écrit {args.out}")


if __name__ == "__main__":
    main()

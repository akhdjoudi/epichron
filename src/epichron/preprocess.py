"""Nettoyage et présélection des sites CpG.

Entrée : data/interim/<GSE>_betas.parquet et <GSE>_meta.parquet (sortie de epichron.geo).
Sortie, dans data/processed/ :
- features.parquet : une ligne par échantillon (index GSM), une colonne par site CpG retenu
- samples.parquet  : métadonnées + colonne split (train, test, external)

Règle d'or : tout ce qui « apprend » (sites retenus, médianes d'imputation, corrélations)
est calculé sur le split train uniquement, puis appliqué tel quel au test et à la cohorte externe.

Usage : python -m epichron.preprocess [--n-sites 20000]
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
TRAIN_GSE = "GSE40279"
EXTERNAL_GSE = "GSE87571"


def split_train_test(meta: pd.DataFrame, test_size: float = 0.2, seed: int = SEED) -> pd.Series:
    """Découpage train/test stratifié par tranche d'âge de 10 ans, pour garder la même pyramide des âges."""
    rng = np.random.default_rng(seed)
    split = pd.Series("train", index=meta.index)
    for _, group in meta.groupby(meta["age"] // 10):
        n_test = int(round(len(group) * test_size))
        split[rng.choice(group.index, size=n_test, replace=False)] = "test"
    return split


def common_sites(train: pd.DataFrame, external: pd.DataFrame, max_missing: float = 0.05) -> pd.Index:
    """Sites présents dans les deux jeux, avec au plus max_missing de valeurs manquantes dans chacun."""
    ok_train = train.isna().mean(axis=1) <= max_missing
    ok_external = external.isna().mean(axis=1) <= max_missing
    return train.index[ok_train].intersection(external.index[ok_external])


def age_correlation(X: pd.DataFrame, age: pd.Series, chunk: int = 50000) -> pd.Series:
    """Corrélation de Pearson entre chaque site (colonne de X) et l'âge, en ignorant les valeurs manquantes.

    Calculée par blocs de colonnes pour tenir en mémoire sur les 450 000 sites de la puce.
    """
    y = age.to_numpy(dtype=np.float64)[:, None]
    out = []
    for start in range(0, X.shape[1], chunk):
        x = X.iloc[:, start:start + chunk].to_numpy(dtype=np.float64)
        mask = ~np.isnan(x)
        n = mask.sum(axis=0)
        mx = np.where(mask, x, 0.0).sum(axis=0) / n
        my = np.where(mask, y, 0.0).sum(axis=0) / n
        dx = np.where(mask, x - mx, 0.0)
        dy = np.where(mask, y - my, 0.0)
        out.append((dx * dy).sum(axis=0) / np.sqrt((dx**2).sum(axis=0) * (dy**2).sum(axis=0)))
    return pd.Series(np.concatenate(out), index=X.columns)


def preprocess(data_dir: Path, n_sites: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    interim = data_dir / "interim"
    betas_train = pd.read_parquet(interim / f"{TRAIN_GSE}_betas.parquet")
    betas_ext = pd.read_parquet(interim / f"{EXTERNAL_GSE}_betas.parquet")
    meta = pd.concat([
        pd.read_parquet(interim / f"{TRAIN_GSE}_meta.parquet"),
        pd.read_parquet(interim / f"{EXTERNAL_GSE}_meta.parquet"),
    ])
    meta = meta[meta["age"].notna()]

    sites = common_sites(betas_train, betas_ext)
    print(f"{len(sites)} sites communs aux deux jeux")

    # Échantillons en lignes, sites en colonnes : le format attendu par scikit-learn.
    X_train_all = betas_train.loc[sites].T
    X_ext = betas_ext.loc[sites].T
    X_train_all = X_train_all.loc[X_train_all.index.intersection(meta.index)]
    X_ext = X_ext.loc[X_ext.index.intersection(meta.index)]

    split = split_train_test(meta.loc[X_train_all.index])
    train_ids = split.index[split == "train"]

    r = age_correlation(X_train_all.loc[train_ids], meta.loc[train_ids, "age"])
    keep = r.abs().sort_values(ascending=False).index[:n_sites]
    print(f"{len(keep)} sites retenus, |r| de {r[keep].abs().min():.2f} à {r[keep].abs().max():.2f}")

    features = pd.concat([X_train_all[keep], X_ext[keep]])
    medians = features.loc[train_ids].median()
    features = features.fillna(medians).astype(np.float32)

    samples = meta.loc[features.index, ["age", "sex", "dataset"]].copy()
    samples["split"] = pd.concat([split, pd.Series("external", index=X_ext.index)])
    return features, samples


def main() -> None:
    parser = argparse.ArgumentParser(description="Nettoie les bêtas et présélectionne les sites liés à l'âge.")
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--n-sites", type=int, default=20000)
    args = parser.parse_args()

    features, samples = preprocess(args.data_dir, args.n_sites)
    out = args.data_dir / "processed"
    out.mkdir(parents=True, exist_ok=True)
    features.to_parquet(out / "features.parquet")
    samples.to_parquet(out / "samples.parquet")
    print(samples.groupby("split").age.describe().round(1))


if __name__ == "__main__":
    main()

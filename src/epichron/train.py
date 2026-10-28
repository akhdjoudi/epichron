"""Entraînement et évaluation des horloges.

Entrée : data/processed/features.parquet et samples.parquet (sortie de epichron.preprocess).
Sortie :
- data/models/<modèle>.joblib
- data/processed/predictions.parquet : âge prédit par chaque modèle pour chaque échantillon
- data/processed/metrics.json        : erreurs par modèle et par split

Les modèles apprennent sur F(âge), la transformation de Horvath (2013) : logarithmique
avant 20 ans, linéaire ensuite, parce que la méthylation change bien plus vite chez l'enfant.

Usage : python -m epichron.train
"""

import argparse
import json
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import ElasticNetCV
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 42
ADULT_AGE = 20
LGBM_SITES = 2000
NEURAL_SITES = 200


def transform_age(age):
    age = np.asarray(age, dtype=float)
    return np.where(age <= ADULT_AGE, np.log(age + 1) - np.log(ADULT_AGE + 1), (age - ADULT_AGE) / (ADULT_AGE + 1))


def inverse_transform_age(y):
    y = np.asarray(y, dtype=float)
    return np.where(y <= 0, np.exp(y + np.log(ADULT_AGE + 1)) - 1, y * (ADULT_AGE + 1) + ADULT_AGE)


class LinearClock:
    """ElasticNet sur bêtas standardisés, puis replié en poids sur bêtas bruts.

    Âge prédit = F⁻¹(intercept + Σ poids × bêta) : exactement ce que le site calcule dans le navigateur.
    """

    def fit(self, X: pd.DataFrame, age: pd.Series) -> "LinearClock":
        scaler = StandardScaler().fit(X)
        self.cv = ElasticNetCV(l1_ratio=0.5, cv=10, alphas=40, max_iter=10000, n_jobs=-1, random_state=SEED)
        self.cv.fit(scaler.transform(X), transform_age(age))
        weights = self.cv.coef_ / scaler.scale_
        nonzero = weights != 0
        self.weights = pd.Series(weights[nonzero], index=X.columns[nonzero])
        self.intercept = float(self.cv.intercept_ - (self.cv.coef_ * scaler.mean_ / scaler.scale_).sum())
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return inverse_transform_age(self.intercept + X[self.weights.index].to_numpy(np.float64) @ self.weights.to_numpy())


class BoostedClock:
    """LightGBM sur les sites les plus corrélés à l'âge : capte les relations non linéaires."""

    def fit(self, X: pd.DataFrame, age: pd.Series) -> "BoostedClock":
        self.sites = X.columns[:LGBM_SITES]
        self.model = lgb.LGBMRegressor(
            n_estimators=1500, learning_rate=0.02, num_leaves=15, min_child_samples=10,
            subsample=0.8, subsample_freq=1, colsample_bytree=0.3, reg_lambda=1.0,
            random_state=SEED, verbose=-1,
        )
        self.model.fit(X[self.sites], transform_age(age))
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return inverse_transform_age(self.model.predict(X[self.sites]))


class NeuralClock:
    """Réseau de neurones (une couche cachée) sur les 200 sites les plus corrélés à l'âge.

    Réglages choisis par validation croisée sur le train seulement : avec 526 personnes, 2000 sites
    ou une faible régularisation font sur-apprendre le réseau (erreur de 9 à 14 ans, contre 3,8 ans avec 200 sites).
    """

    def fit(self, X: pd.DataFrame, age: pd.Series) -> "NeuralClock":
        self.sites = X.columns[:NEURAL_SITES]
        self.model = make_pipeline(
            StandardScaler(),
            MLPRegressor(hidden_layer_sizes=(64,), alpha=10.0, max_iter=1000, random_state=SEED),
        )
        self.model.fit(X[self.sites], transform_age(age))
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return inverse_transform_age(self.model.predict(X[self.sites]))


MODELS = {"elasticnet": LinearClock, "lightgbm": BoostedClock, "neural": NeuralClock}


def metrics(age: np.ndarray, predicted: np.ndarray) -> dict:
    error = np.abs(predicted - age)
    return {
        "mae": round(float(error.mean()), 2),
        "median_ae": round(float(np.median(error)), 2),
        "pearson_r": round(float(np.corrcoef(age, predicted)[0, 1]), 3),
        "n": int(len(age)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Entraîne et évalue les horloges épigénétiques.")
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    args = parser.parse_args()

    processed = args.data_dir / "processed"
    X = pd.read_parquet(processed / "features.parquet")
    samples = pd.read_parquet(processed / "samples.parquet")
    train = samples.index[samples.split == "train"]

    models_dir = args.data_dir / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    predictions = samples.copy()
    report = {}
    for name, Model in MODELS.items():
        model = Model().fit(X.loc[train], samples.loc[train, "age"])
        joblib.dump(model, models_dir / f"{name}.joblib")
        predictions[name] = model.predict(X)
        report[name] = {
            split: metrics(group.age.to_numpy(), group[name].to_numpy())
            for split, group in predictions.groupby("split")
        }
        if name == "elasticnet":
            report[name]["n_cpgs"] = int(len(model.weights))
        print(name, json.dumps(report[name]))

    predictions.to_parquet(processed / "predictions.parquet")
    (processed / "metrics.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    # Réimporte le module sous son vrai nom : sinon joblib enregistre les classes sous __main__
    # et epichron.export ne peut plus recharger les modèles.
    from epichron.train import main as run

    run()

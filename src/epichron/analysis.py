"""Analyse des prédictions : biais lié à l'âge, accélération du vieillissement.

Lit app/public/data/predictions.csv et écrit app/public/data/analysis.json.

Deux notions à ne pas confondre :
- accélération brute  = âge prédit - âge réel (déjà dans predictions.csv), qui dépend de l'âge si le modèle est biaisé ;
- accélération indépendante de l'âge = résidu de la régression âge prédit ~ âge réel (EAA / AgeAccelResid),
  calculée cohorte par cohorte.

Usage : python -m epichron.analysis
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

DATA_DIR = Path("app/public/data")
EVAL_SPLIT = "external"
AGE_BINS = [(10, 30), (30, 50), (50, 70), (70, 110)]


def bias_line(age: pd.Series, predicted: pd.Series) -> dict:
    """Droite âge prédit = pente × âge réel + ordonnée. Pente < 1 : régression vers la moyenne."""
    fit = stats.linregress(age, predicted)
    return {"slope": float(fit.slope), "slope_stderr": float(fit.stderr), "intercept": float(fit.intercept),
            "r": float(fit.rvalue), "n": int(len(age))}


def error_by_age_bin(age: pd.Series, predicted: pd.Series) -> list[dict]:
    """Erreur moyenne signée (prédit - réel) et absolue par tranche d'âge."""
    rows = []
    for lo, hi in AGE_BINS:
        m = (age >= lo) & (age < hi)
        if m.sum() == 0:
            continue
        err = predicted[m] - age[m]
        rows.append({"from": lo, "to": hi if hi < 110 else None, "n": int(m.sum()),
                     "bias": round(float(err.mean()), 2), "mae": round(float(err.abs().mean()), 2)})
    return rows


def acceleration_by_sex(df: pd.DataFrame, column: str) -> dict:
    """Moyenne par sexe et test de Welch sur l'écart entre hommes et femmes."""
    f = df.loc[df.sex == "F", column]
    m = df.loc[df.sex == "M", column]
    t = stats.ttest_ind(m, f, equal_var=False)
    return {"F": round(float(f.mean()), 2), "M": round(float(m.mean()), 2),
            "diff_M_minus_F": round(float(m.mean() - f.mean()), 2),
            "p_value": float(t.pvalue), "n_F": int(len(f)), "n_M": int(len(m))}


def residual_acceleration(df: pd.DataFrame) -> pd.Series:
    """Accélération corrigée : âge prédit moins l'âge qu'attend la droite de biais de SA cohorte pour cet âge réel."""
    line = bias_line(df.age, df.predicted_age)
    return df.predicted_age - (line["slope"] * df.age + line["intercept"])


def analyse(predictions: pd.DataFrame) -> dict:
    ext = predictions[predictions.split == EVAL_SPLIT].copy()
    ext["raw_error"] = ext.predicted_age - ext.age
    ext["residual"] = residual_acceleration(ext)

    return {
        "bias_lines": {s: bias_line(g.age, g.predicted_age) for s, g in predictions.groupby("split")},
        "error_by_age": error_by_age_bin(ext.age, ext.predicted_age),
        "acceleration_by_sex": {
            "raw": {s: acceleration_by_sex(g, "acceleration") for s, g in predictions.groupby("split") if s != "train"},
            "age_independent": acceleration_by_sex(ext, "residual"),
        },
        "age_vs_acceleration_r": {
            "raw": round(float(stats.pearsonr(ext.age, ext.raw_error)[0]), 3),
            "age_independent": round(float(stats.pearsonr(ext.age, ext.residual)[0]), 3),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    args = parser.parse_args()
    predictions = pd.read_csv(args.data_dir / "predictions.csv")
    result = analyse(predictions)
    out = args.data_dir / "analysis.json"
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Écrit {out}")


if __name__ == "__main__":
    main()

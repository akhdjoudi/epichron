"""Analyse des prédictions : biais lié à l'âge, correction, accélération du vieillissement.

Lit app/public/data/predictions.csv et écrit app/public/data/analysis.json.

Deux notions à ne pas confondre :
- accélération brute  = âge prédit - âge réel (déjà dans predictions.csv), qui dépend de l'âge si le modèle est biaisé ;
- accélération corrigée = résidu de la régression âge prédit ~ âge réel, qui n'en dépend plus (EAA / AgeAccelResid).

La droite de correction s'ajuste sur le test interne (jamais vu à l'entraînement, où le modèle sur-apprend),
puis s'applique telle quelle à la cohorte externe : c'est le seul test honnête d'une correction transférable.
L'accélération corrigée, elle, se calcule cohorte par cohorte (on retire à chaque cohorte son propre biais).

Usage : python -m epichron.analysis
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

DATA_DIR = Path("app/public/data")
FIT_SPLIT = "test"
EVAL_SPLIT = "external"
AGE_BINS = [(10, 30), (30, 50), (50, 70), (70, 110)]


def bias_line(age: pd.Series, predicted: pd.Series) -> dict:
    """Droite âge prédit = pente × âge réel + ordonnée. Pente < 1 : régression vers la moyenne."""
    fit = stats.linregress(age, predicted)
    return {"slope": float(fit.slope), "slope_stderr": float(fit.stderr), "intercept": float(fit.intercept),
            "r": float(fit.rvalue), "n": int(len(age))}


def correct(predicted: pd.Series, age: pd.Series, line: dict) -> pd.Series:
    """Redresse l'âge prédit pour retirer le biais : on inverse la droite de biais."""
    return (predicted - line["intercept"]) / line["slope"]


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
    fit = predictions[predictions.split == FIT_SPLIT]
    ext = predictions[predictions.split == EVAL_SPLIT].copy()
    line = bias_line(fit.age, fit.predicted_age)

    ext["corrected"] = correct(ext.predicted_age, ext.age, line)
    ext["raw_error"] = ext.predicted_age - ext.age
    ext["corrected_error"] = ext.corrected - ext.age
    ext["residual"] = residual_acceleration(ext)

    return {
        "bias_lines": {s: bias_line(g.age, g.predicted_age) for s, g in predictions.groupby("split")},
        "correction": {
            "fitted_on": FIT_SPLIT, "applied_to": EVAL_SPLIT, **line,
            "mae_before": round(float(ext.raw_error.abs().mean()), 2),
            "mae_after": round(float(ext.corrected_error.abs().mean()), 2),
            "mean_error_before": round(float(ext.raw_error.mean()), 2),
            "mean_error_after": round(float(ext.corrected_error.mean()), 2),
        },
        "error_by_age": {
            "before": error_by_age_bin(ext.age, ext.predicted_age),
            "after": error_by_age_bin(ext.age, ext.corrected),
        },
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

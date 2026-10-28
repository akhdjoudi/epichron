"""Figures de l'analyse (étape 6) dans reports/ : biais d'âge et accélération par sexe.

Usage : python -m epichron.figures
"""

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from epichron.analysis import DATA_DIR, EVAL_SPLIT, bias_line, residual_acceleration


def plot_bias(pred: pd.DataFrame, out: Path) -> None:
    fig, axes = plt.subplots(1, 3, figsize=(14, 4.2), sharey=True)
    for ax, split in zip(axes, ["train", "test", EVAL_SPLIT]):
        g = pred[pred.split == split]
        line = bias_line(g.age, g.predicted_age)
        ax.scatter(g.age, g.predicted_age, s=8, alpha=0.5)
        ax.plot([10, 100], [10, 100], "k--", lw=1, label="y = x")
        ax.plot([10, 100], [line["intercept"] + line["slope"] * a for a in (10, 100)], "r", label=f"pente {line['slope']:.2f}")
        ax.set(title=f"{split} (n = {line['n']})", xlabel="âge réel")
        ax.legend()
    axes[0].set_ylabel("âge prédit")
    fig.tight_layout()
    fig.savefig(out / "biais_age.png", dpi=150)


def plot_sex(pred: pd.DataFrame, out: Path) -> None:
    ext = pred[pred.split == EVAL_SPLIT].copy()
    ext["residual"] = residual_acceleration(ext)
    fig, ax = plt.subplots(figsize=(4.5, 4.2))
    ax.boxplot([ext.residual[ext.sex == s] for s in ("F", "M")], tick_labels=["femmes", "hommes"])
    ax.axhline(0, color="k", lw=1)
    ax.set(ylabel="accélération corrigée (ans)", title="Cohorte externe")
    fig.tight_layout()
    fig.savefig(out / "acceleration_sexe.png", dpi=150)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--out", type=Path, default=Path("reports"))
    args = parser.parse_args()
    args.out.mkdir(exist_ok=True)
    pred = pd.read_csv(args.data_dir / "predictions.csv")
    plot_bias(pred, args.out)
    plot_sex(pred, args.out)
    print(f"Figures dans {args.out}/")


if __name__ == "__main__":
    main()

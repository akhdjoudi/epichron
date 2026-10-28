import numpy as np
import pandas as pd

from epichron.shap_analysis import YEARS_PER_UNIT, explain, rank_genes, rank_sites


class FakeLinear:
    def __init__(self, weights, intercept):
        self.weights = pd.Series(weights)
        self.intercept = intercept


def data(seed=0):
    rng = np.random.default_rng(seed)
    X = pd.DataFrame(rng.uniform(0, 1, (50, 3)), columns=["cg1", "cg2", "cg3"])
    bg = pd.DataFrame(rng.uniform(0, 1, (80, 3)), columns=X.columns)
    manifest = pd.DataFrame({"gene": ["A", "A", "B"]}, index=X.columns)
    return X, bg, manifest


def test_linear_shap_is_additive():
    X, bg, _ = data()
    model = FakeLinear({"cg1": 2.0, "cg2": -1.0, "cg3": 0.5}, 0.3)
    values = explain(model, X, bg)
    base = (bg[model.weights.index] @ model.weights).mean() + model.intercept
    pred = X[model.weights.index] @ model.weights + model.intercept
    np.testing.assert_allclose(values.sum(axis=1) / YEARS_PER_UNIT + base, pred, atol=1e-6)


def test_rank_genes_sums_sites_of_same_gene():
    X, _, manifest = data()
    values = pd.DataFrame({"cg1": 1.0, "cg2": -1.0, "cg3": 0.5}, index=X.index)
    genes = {g["gene"]: g for g in rank_genes(values, manifest)}
    assert genes["A"]["mean_abs_years"] == 0.0  # les deux sites se compensent
    assert genes["A"]["n_sites"] == 2
    assert genes["B"]["mean_abs_years"] == 0.5


def test_rank_sites_orders_by_importance():
    X, _, manifest = data()
    values = pd.DataFrame({"cg1": 1.0, "cg2": 3.0, "cg3": 2.0}, index=X.index)
    assert [s["cpg"] for s in rank_sites(values, manifest)] == ["cg2", "cg3", "cg1"]

import numpy as np
import pandas as pd

from epichron import preprocess


def test_split_is_stratified_and_reproducible():
    meta = pd.DataFrame({"age": np.repeat([25, 45, 65, 85], 10)}, index=[f"GSM{i}" for i in range(40)])
    split = preprocess.split_train_test(meta, test_size=0.2)
    assert (split == "test").sum() == 8
    # Deux échantillons de test par tranche d'âge.
    assert (meta.loc[split == "test", "age"].value_counts() == 2).all()
    assert split.equals(preprocess.split_train_test(meta, test_size=0.2))


def test_common_sites_drops_missing_and_unshared():
    train = pd.DataFrame({"a": [0.1, 0.2, np.nan, 0.4], "b": [0.1, 0.2, 0.3, 0.4]}, index=["cg1", "cg2", "cg3", "cg4"])
    external = pd.DataFrame({"c": [0.1, np.nan, 0.3]}, index=["cg1", "cg2", "cg3"])
    assert list(preprocess.common_sites(train, external, max_missing=0.0)) == ["cg1"]


def test_age_correlation_ignores_missing_values():
    age = pd.Series([20.0, 40.0, 60.0, 80.0])
    X = pd.DataFrame({
        "up": [0.1, 0.2, 0.3, 0.4],
        "down": [0.9, np.nan, 0.5, 0.3],
        "flat": [0.5, 0.4, 0.6, 0.5],
    })
    r = preprocess.age_correlation(X, age, chunk=2)
    assert np.isclose(r["up"], 1.0)
    assert np.isclose(r["down"], -1.0)
    assert abs(r["flat"]) < 0.5

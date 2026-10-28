import numpy as np
import pandas as pd

from epichron import train


def test_age_transform_round_trip():
    age = np.array([0.0, 5.0, 20.0, 45.0, 101.0])
    assert np.allclose(train.inverse_transform_age(train.transform_age(age)), age)
    # Continue en 20 ans : les deux branches valent 0.
    assert np.isclose(train.transform_age(20.0), 0.0)


def test_linear_clock_folds_scaling_into_raw_weights():
    rng = np.random.default_rng(0)
    age = pd.Series(rng.uniform(20, 90, 200))
    X = pd.DataFrame(rng.uniform(0, 1, (200, 30)), columns=[f"cg{i}" for i in range(30)])
    X["cg0"] = 0.2 + 0.006 * age + rng.normal(0, 0.01, 200)
    X["cg1"] = 0.9 - 0.004 * age + rng.normal(0, 0.01, 200)
    clock = train.LinearClock().fit(X, age)
    assert {"cg0", "cg1"} <= set(clock.weights.index)
    # Le calcul « navigateur » (poids bruts + intercept) redonne la prédiction du pipeline standardisé.
    raw = train.inverse_transform_age(clock.intercept + X[clock.weights.index] @ clock.weights)
    assert np.allclose(raw, clock.predict(X))
    assert np.abs(clock.predict(X) - age).mean() < 3


def test_neural_clock_learns_age_from_few_sites():
    rng = np.random.default_rng(0)
    age = pd.Series(rng.uniform(20, 90, 200))
    X = pd.DataFrame(rng.uniform(0, 1, (200, 400)), columns=[f"cg{i}" for i in range(400)])
    X["cg0"] = 0.2 + 0.006 * age + rng.normal(0, 0.01, 200)
    X["cg1"] = 0.9 - 0.004 * age + rng.normal(0, 0.01, 200)
    X = X[["cg0", "cg1"] + [c for c in X.columns if c not in ("cg0", "cg1")]]  # les sites les plus corrélés en tête, comme preprocess
    clock = train.NeuralClock().fit(X, age)
    assert len(clock.sites) == train.NEURAL_SITES
    assert np.abs(clock.predict(X) - age).mean() < 6

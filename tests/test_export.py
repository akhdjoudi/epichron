import numpy as np
import pandas as pd

from epichron import export, train


def test_age_trend_recovers_slope():
    age = pd.Series(np.linspace(20, 90, 50))
    X = pd.DataFrame({"cg1": 0.2 + 0.005 * age, "cg2": 0.8 - 0.002 * age})
    trend = export.age_trend(X, age)
    assert np.allclose(trend.loc["cg1"], [0.2, 0.005])
    assert np.allclose(trend.loc["cg2"], [0.8, -0.002])


def test_browser_predict_matches_inverse_transform():
    weights = {"intercept": 0.5, "cpgs": [{"weight": 2.0}, {"weight": -1.0}]}
    expected = train.inverse_transform_age(0.5 + 2.0 * 0.6 - 1.0 * 0.3)
    assert np.isclose(export.browser_predict(weights, [0.6, 0.3]), expected)


def test_demo_samples_cover_age_range():
    predictions = pd.DataFrame(
        {"age": np.arange(100.0), "split": ["external"] * 80 + ["train"] * 20},
        index=[f"GSM{i}" for i in range(100)],
    )
    picks = export.pick_demo_samples(predictions, 8)
    ages = predictions.loc[picks, "age"]
    assert len(picks) == 8 and ages.min() < 10 and ages.max() > 70
    assert (predictions.loc[picks, "split"] == "external").all()

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


def test_decade_means_groups_and_clips_ages():
    age = pd.Series([12.0, 18.0, 25.0, 97.0, 101.0], index=list("abcde"))
    X = pd.DataFrame({"cg1": [0.1, 0.3, 0.5, 0.8, 0.9]}, index=list("abcde"))
    means = export.decade_means(X, age)
    assert list(means.index) == [10, 20, 90]
    assert np.isclose(means.loc[10, "cg1"], 0.2) and np.isclose(means.loc[90, "cg1"], 0.85)
    assert list(means["n"]) == [2, 1, 2]

import numpy as np
import pandas as pd

from epichron.analysis import (acceleration_by_sex, analyse, bias_line, correct, error_by_age_bin,
                               residual_acceleration)


def synthetic(n=400, slope=0.8, offset=10, seed=0):
    rng = np.random.default_rng(seed)
    age = rng.uniform(15, 95, n)
    return pd.DataFrame({"age": age, "predicted_age": slope * age + offset + rng.normal(0, 1, n),
                         "sex": rng.choice(["F", "M"], n)})


def test_bias_line_recovers_slope():
    d = synthetic()
    line = bias_line(d.age, d.predicted_age)
    assert abs(line["slope"] - 0.8) < 0.02
    assert abs(line["intercept"] - 10) < 1


def test_correct_removes_bias():
    d = synthetic()
    line = bias_line(d.age, d.predicted_age)
    fixed = correct(d.predicted_age, d.age, line)
    assert abs((fixed - d.age).mean()) < 0.2
    assert abs(np.corrcoef(d.age, fixed - d.age)[0, 1]) < 0.1


def test_residual_independent_of_age():
    d = synthetic()
    assert abs(np.corrcoef(d.age, residual_acceleration(d))[0, 1]) < 1e-6


def test_error_by_age_bin_covers_all_samples():
    d = synthetic()
    assert sum(r["n"] for r in error_by_age_bin(d.age, d.predicted_age)) == len(d)


def test_acceleration_by_sex_detects_difference():
    d = synthetic()
    d["acc"] = np.where(d.sex == "M", 3.0, 0.0) + np.random.default_rng(1).normal(0, 1, len(d))
    res = acceleration_by_sex(d, "acc")
    assert res["diff_M_minus_F"] > 2.5 and res["p_value"] < 1e-6


def test_analyse_keys():
    a = synthetic(seed=1).assign(split="test", acceleration=0.0)
    b = synthetic(seed=2).assign(split="external", acceleration=0.0)
    out = analyse(pd.concat([a, b], ignore_index=True))
    assert {"bias_lines", "correction", "error_by_age", "acceleration_by_sex"} <= out.keys()
    assert out["correction"]["mae_after"] < out["correction"]["mae_before"]

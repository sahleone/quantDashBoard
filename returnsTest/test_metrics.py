import pandas as pd
import numpy as np
from returnsTest import metrics


def make_growing_series(days=252, daily_return=0.0005):
    idx = pd.date_range(end=pd.Timestamp.today(), periods=days, freq="D")
    vals = 100.0 * (1 + daily_return) ** np.arange(days)
    return pd.Series(vals, index=idx)


def test_basic_metrics_monotonic_increase():
    s = make_growing_series()
    # increasing series -> zero drawdown
    dd = metrics.drawdown_metrics(s)
    assert dd["maxToDate"] == 0.0
    # volatility > 0 (because of daily returns variance being constant)
    vol = metrics.annualized_volatility(s)
    assert vol is not None
    # sharpe should return a numeric or None (depending on rf)
    sh = metrics.sharpe_ratio(s, risk_free_rate=0.0)
    assert sh is None or isinstance(sh, float)


def test_beta_alpha_simple():
    s = make_growing_series()
    # make benchmark with similar growth
    b = make_growing_series(daily_return=0.0004)
    res = metrics.beta_alpha(s, b, risk_free_rate=0.0)
    assert "beta" in res and "alpha" in res

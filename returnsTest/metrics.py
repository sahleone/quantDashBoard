"""Portfolio metrics utilities

Functions accept a pandas Series of portfolio values indexed by dates (pd.DatetimeIndex or date-like).
They compute daily returns and then annualized metrics using a 252 trading-day convention.

Key functions:
- compute_returns
- annualized_return
- annualized_volatility
- downside_volatility
- sharpe_ratio
- sortino_ratio
- calmar_ratio
- drawdown_series / drawdown_metrics
- beta_alpha
- compute_metrics_for_periods (wrapper producing structured dict)

"""
from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Optional, Dict

TRADING_DAYS = 252


def compute_returns(values: pd.Series) -> pd.Series:
    """Compute simple percentage returns from a value series.

    Returns a pd.Series of daily pct_change() values (not log returns).
    """
    if values is None or len(values) < 2:
        return pd.Series(dtype=float)
    s = values.dropna()
    returns = s.pct_change().dropna()
    returns.name = "returns"
    return returns


def _annualize_return(daily_ret: pd.Series) -> Optional[float]:
    if daily_ret.empty:
        return None
    cumulative = (1 + daily_ret).prod() - 1
    days = daily_ret.index.size
    years = days / TRADING_DAYS
    if years <= 0:
        return None
    return (1 + cumulative) ** (1 / years) - 1


def annualized_return(values: pd.Series) -> Optional[float]:
    dr = compute_returns(values)
    return _annualize_return(dr)


def annualized_volatility(values: pd.Series) -> Optional[float]:
    dr = compute_returns(values)
    if dr.empty:
        return None
    return float(dr.std(ddof=1) * np.sqrt(TRADING_DAYS))


def downside_volatility(values: pd.Series, target: float = 0.0) -> Optional[float]:
    """Annualized downside volatility (std of returns below target).

    target is a per-period threshold; default 0 (no return). If you want to use a
    risk-free rate, pass the per-period equivalent (e.g., rf/252).
    """
    dr = compute_returns(values)
    if dr.empty:
        return None
    negatives = dr[dr < target]
    if negatives.empty:
        return 0.0
    return float(negatives.std(ddof=1) * np.sqrt(TRADING_DAYS))


def sharpe_ratio(values: pd.Series, risk_free_rate: float = 0.0) -> Optional[float]:
    """Annualized Sharpe ratio using TRADING_DAYS convention.

    risk_free_rate is annual (e.g., 0.02 for 2%).
    """
    dr = compute_returns(values)
    if dr.empty:
        return None
    rf_daily = risk_free_rate / TRADING_DAYS
    excess = dr - rf_daily
    ann_excess = _annualize_return(excess)
    ann_vol = float(excess.std(ddof=1) * np.sqrt(TRADING_DAYS))
    if ann_vol == 0 or ann_excess is None:
        return None
    return float(ann_excess / ann_vol)


def sortino_ratio(values: pd.Series, risk_free_rate: float = 0.0, target: float = 0.0) -> Optional[float]:
    dr = compute_returns(values)
    if dr.empty:
        return None
    rf_daily = risk_free_rate / TRADING_DAYS
    excess = dr - rf_daily
    ann_excess = _annualize_return(excess)
    dd_vol = downside_volatility(values, target=target)
    if dd_vol is None or dd_vol == 0 or ann_excess is None:
        return None
    return float(ann_excess / dd_vol)


def calmar_ratio(values: pd.Series) -> Optional[float]:
    """Calmar: annualized return / max drawdown (positive quantity).

    If max drawdown is 0 (no drawdown), returns None.
    """
    ann_ret = annualized_return(values)
    dd = drawdown_metrics(values)
    if ann_ret is None or dd is None:
        return None
    max_dd = dd.get("maxToDate", 0.0)
    if max_dd == 0:
        return None
    return float(ann_ret / max_dd)


def drawdown_series(values: pd.Series) -> pd.Series:
    """Return drawdown series as positive fraction (0 = no drawdown).

    drawdown(t) = (peak_to_date - value(t)) / peak_to_date
    """
    if values is None or values.empty:
        return pd.Series(dtype=float)
    s = values.dropna()
    peak = s.cummax()
    dd = (peak - s) / peak
    dd.name = "drawdown"
    return dd


def drawdown_metrics(values: pd.Series) -> Optional[Dict[str, float]]:
    """Return dictionary with drawdown metrics:
    - current: current drawdown (positive)
    - maxToDate: maximum drawdown observed (positive)
    - oneMonth, oneYear: max drawdown within those lookbacks
    - rollingPeak: current rolling peak value
    """
    if values is None or values.empty:
        return None
    s = values.dropna()
    dd = drawdown_series(s)
    if dd.empty:
        return None
    now = s.index.max()
    def _max_dd_in_period(days: int) -> float:
        start = now - pd.Timedelta(days=days)
        sub = dd[dd.index >= start]
        return float(sub.max()) if not sub.empty else 0.0

    metrics = {
        "current": float(dd.iloc[-1]),
        "maxToDate": float(dd.max()),
        "oneMonth": _max_dd_in_period(30),
        "oneYear": _max_dd_in_period(365),
        "rollingPeak": float(s.cummax().iloc[-1]),
    }
    return metrics


def _align_returns(portfolio_values: pd.Series, benchmark_values: pd.Series) -> tuple[pd.Series, pd.Series]:
    p = portfolio_values.dropna()
    b = benchmark_values.dropna()
    # reindex both to union of dates and forward-fill prices for missing market days
    idx = p.index.union(b.index).sort_values()
    p2 = p.reindex(idx).ffill()
    b2 = b.reindex(idx).ffill()
    pr = compute_returns(p2)
    br = compute_returns(b2)
    joined = pd.concat([pr, br], axis=1).dropna()
    if joined.shape[1] < 2:
        return pd.Series(dtype=float), pd.Series(dtype=float)
    return joined.iloc[:,0], joined.iloc[:,1]


def beta_alpha(portfolio_values: pd.Series, benchmark_values: pd.Series, risk_free_rate: float = 0.0) -> Dict[str, Optional[float]]:
    """Return beta and alpha (annualized) of portfolio vs benchmark.

    Alpha is the annualized excess return not explained by beta: alpha = (Rp - rf) - beta*(Rb - rf)
    where returns are annualized.
    """
    pr, br = _align_returns(portfolio_values, benchmark_values)
    if pr.empty or br.empty:
        return {"beta": None, "alpha": None}
    cov = np.cov(pr.values, br.values, ddof=1)
    cov_pb = float(cov[0,1])
    var_b = float(cov[1,1])
    if var_b == 0:
        beta = None
    else:
        beta = cov_pb / var_b

    # annualized returns
    ann_p = _annualize_return(pr)
    ann_b = _annualize_return(br)
    if ann_p is None or ann_b is None or beta is None:
        alpha = None
    else:
        alpha = (ann_p - risk_free_rate) - beta * (ann_b - risk_free_rate)

    return {"beta": float(beta) if beta is not None else None, "alpha": float(alpha) if alpha is not None else None}


def compute_metrics_for_periods(values: pd.Series, benchmark: Optional[pd.Series] = None, rf: float = 0.0, periods=None) -> Dict:
    """Compute a structured metrics dict matching the notebook outline.

    periods may be a dict mapping keys to pandas DateOffset (or strings), but
    by default calculates the common periods: oneMonth, threeMonth, sixMonth, oneYear, inceptionToDate.
    """
    if periods is None:
        periods = {
            "oneMonth": pd.DateOffset(months=1),
            "threeMonth": pd.DateOffset(months=3),
            "sixMonth": pd.DateOffset(months=6),
            "oneYear": pd.DateOffset(years=1),
            "inceptionToDate": None,
        }

    out = {}
    last_date = values.dropna().index.max() if not values.dropna().empty else None

    def slice_for(offset):
        if offset is None:
            return values.dropna()
        start = last_date - offset
        return values[values.index >= start].dropna()

    # Sharpe, Sortino, Volatility, DownsideVolatility
    out["sharpe"] = {}
    out["sortino"] = {}
    out["volatility"] = {}
    out["downsideVolatility"] = {}

    for k, off in periods.items():
        seg = slice_for(off)
        out["sharpe"][k] = sharpe_ratio(seg, risk_free_rate=rf)
        out["sortino"][k] = sortino_ratio(seg, risk_free_rate=rf)
        out["volatility"][k] = annualized_volatility(seg)
        out["downsideVolatility"][k] = downside_volatility(seg)

    # calmar uses 1y and inception
    out["calmar"] = {
        "oneYear": calmar_ratio(slice_for(periods.get("oneYear"))),
        "inceptionToDate": calmar_ratio(slice_for(periods.get("inceptionToDate"))),
    }

    # drawdown
    dd = drawdown_metrics(values)
    out["drawdown"] = {
        "current": dd.get("current") if dd else None,
        "maxToDate": dd.get("maxToDate") if dd else None,
        "oneMonth": drawdown_metrics(values[values.index >= (last_date - pd.Timedelta(days=30))])["maxToDate"] if last_date is not None else None,
        "oneYear": drawdown_metrics(values[values.index >= (last_date - pd.Timedelta(days=365))])["maxToDate"] if last_date is not None else None,
        "rollingPeak": dd.get("rollingPeak") if dd else None,
    }

    # beta / alpha
    out["beta"] = {"vsSPY": {"oneYear": None, "inceptionToDate": None}}
    out["alpha"] = {"vsSPY": {"oneYear": None, "inceptionToDate": None}}
    if benchmark is not None:
        # oneYear
        br1 = benchmark[benchmark.index >= (last_date - pd.DateOffset(years=1))] if last_date is not None else pd.Series(dtype=float)
        res1 = beta_alpha(values[values.index >= (last_date - pd.DateOffset(years=1))], br1, risk_free_rate=rf) if last_date is not None else {"beta": None, "alpha": None}
        res_all = beta_alpha(values, benchmark, risk_free_rate=rf)
        out["beta"]["vsSPY"]["oneYear"] = res1.get("beta")
        out["beta"]["vsSPY"]["inceptionToDate"] = res_all.get("beta")
        out["alpha"]["vsSPY"]["oneYear"] = res1.get("alpha")
        out["alpha"]["vsSPY"]["inceptionToDate"] = res_all.get("alpha")

    return out

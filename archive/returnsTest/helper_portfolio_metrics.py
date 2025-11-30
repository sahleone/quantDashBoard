# helper_portfolio_metrics.py

import numpy as np
import pandas as pd
from typing import Optional, Tuple, Dict

TRADING_DAYS = 252


def compute_sharpe_ratio(
    daily_returns: pd.Series,
    risk_free_annual: float = 0.02,
) -> float:
    """
    Annualized Sharpe ratio from daily returns.

    Sharpe = (E[R - R_f]) / std(R - R_f) * sqrt(252)
    """
    r = daily_returns.dropna()
    if r.empty or len(r) < 2:
        return np.nan

    rf_daily = risk_free_annual / TRADING_DAYS
    excess = r - rf_daily

    mean_excess = excess.mean()
    std_excess = excess.std(ddof=1)

    if std_excess == 0 or np.isnan(std_excess):
        return np.nan

    return float(mean_excess / std_excess * np.sqrt(TRADING_DAYS))


def annualized_volatility(daily_returns: pd.Series) -> float:
    """
    Annualized volatility from daily simple returns.
    """
    r = daily_returns.dropna()
    if r.empty or len(r) < 2:
        return np.nan

    daily_std = r.std(ddof=1)
    return float(daily_std * np.sqrt(TRADING_DAYS))


def compute_sortino_ratio(
    daily_returns: pd.Series,
    mar_daily: float = 0.0,
    risk_free_annual: float = 0.02,
) -> float:
    """
    Annualized Sortino ratio from daily returns.

    Uses MAR (minimum acceptable return) on a *daily* basis (default 0),
    and subtracts daily risk-free from mean return before annualizing.

    Sortino = (E[R] - R_f) / downside_std * sqrt(252),
    where downside_std is std of min(R - MAR, 0).
    """
    r = daily_returns.dropna()
    if r.empty or len(r) < 2:
        return np.nan

    downside = r - mar_daily
    downside = downside[downside < 0]

    if downside.empty:
        return np.nan

    downside_std = downside.std(ddof=1)
    if downside_std == 0 or np.isnan(downside_std):
        return np.nan

    rf_daily = risk_free_annual / TRADING_DAYS
    mean_excess = r.mean() - rf_daily

    return float(mean_excess / downside_std * np.sqrt(TRADING_DAYS))


def compute_beta(
    port_returns: pd.Series,
    bench_returns: Optional[pd.Series],
) -> float:
    """
    Beta of portfolio vs benchmark, using daily simple returns.

    If bench_returns is None or not enough overlap, returns np.nan.
    """
    if bench_returns is None:
        return np.nan

    df = pd.concat(
        [port_returns.rename("port"), bench_returns.rename("bench")],
        axis=1,
        join="inner",
    ).dropna()

    if df.empty or len(df) < 2:
        return np.nan

    cov = np.cov(df["port"], df["bench"], ddof=1)[0, 1]
    var_bench = np.var(df["bench"], ddof=1)

    if var_bench == 0 or np.isnan(var_bench):
        return np.nan

    return float(cov / var_bench)


def compute_var_cvar(
    daily_returns: pd.Series,
    level: float = 0.95,
) -> Tuple[float, float]:
    """
    Historical daily VaR and CVaR at the given confidence level.

    Returns positive numbers representing losses (e.g. 0.02 = 2% loss).

    VaR:   quantile of the loss distribution at 'level'
    CVaR:  expected loss given that loss >= VaR
    """
    r = daily_returns.dropna()
    if r.empty:
        return np.nan, np.nan

    losses = -r
    var = np.quantile(losses, level)

    tail = losses[losses >= var]
    if tail.empty:
        cvar = np.nan
    else:
        cvar = tail.mean()

    return float(var), float(cvar)


def compute_max_drawdown(daily_returns: pd.Series) -> float:
    """
    Max drawdown from an equity curve built from daily returns.

    Builds equity curve starting at 1.0:
        equity_t = Π (1 + r_i)
    Then max_drawdown = min(equity / cummax(equity) - 1).

    Returns a negative number, e.g. -0.35 = -35% max drawdown.
    """
    r = daily_returns.dropna()
    if r.empty:
        return np.nan

    equity = (1.0 + r).cumprod()
    running_max = equity.cummax()
    drawdown = equity / running_max - 1.0
    return float(drawdown.min())


def compute_total_and_1y_metrics(
    portfolio_df: pd.DataFrame,
    benchmark_returns: Optional[pd.Series] = None,
    risk_free_annual: float = 0.02,
    var_level: float = 0.95,
) -> pd.DataFrame:
    """
    Compute metrics (Total / ITD and Last 1Y) using `simple_returns`:

        - total_return
        - volatility (annualized)
        - sharpe (annualized)
        - sortino (annualized)
        - beta (vs benchmark_returns)
        - var (daily, historical, positive loss)
        - cvar (daily, historical, positive loss)
        - max_drawdown (from equity curve, negative number)

    Returns a DataFrame indexed by ["1Y", "ITD"].
    """
    if "simple_returns" not in portfolio_df.columns:
        raise ValueError("portfolio_df must contain a 'simple_returns' column")

    df = portfolio_df.sort_index()
    if df.empty:
        raise ValueError("portfolio_df is empty")

    r_all = df["simple_returns"]

    end_date = df.index.max()
    one_year_ago = end_date - pd.DateOffset(years=1)
    start_itd = df.index.min()

    metrics: Dict[str, Dict[str, float]] = {}

    def _metrics_for_slice(r_slice: pd.Series) -> Dict[str, float]:
        if r_slice.dropna().empty:
            return {
                k: np.nan
                for k in [
                    "total_return",
                    "volatility",
                    "sharpe",
                    "sortino",
                    "beta",
                    "var",
                    "cvar",
                    "max_drawdown",
                ]
            }

        total_ret = float((1.0 + r_slice).prod() - 1.0)
        vol = annualized_volatility(r_slice)
        sharpe = compute_sharpe_ratio(
            r_slice,
            risk_free_annual=risk_free_annual,
        )
        sortino = compute_sortino_ratio(
            r_slice,
            mar_daily=0.0,
            risk_free_annual=risk_free_annual,
        )
        beta = compute_beta(r_slice, benchmark_returns)
        var, cvar = compute_var_cvar(r_slice, level=var_level)
        mdd = compute_max_drawdown(r_slice)

        return {
            "total_return": total_ret,
            "volatility": vol,
            "sharpe": sharpe,
            "sortino": sortino,
            "beta": beta,
            "var": var,
            "cvar": cvar,
            "max_drawdown": mdd,
        }

    # Last 1 year
    mask_1y = (df.index >= max(one_year_ago, start_itd)) & (df.index <= end_date)
    r_1y = r_all[mask_1y]
    metrics["1Y"] = _metrics_for_slice(r_1y)

    # Inception to date (ITD)
    metrics["ITD"] = _metrics_for_slice(r_all)

    out = pd.DataFrame.from_dict(metrics, orient="index")
    out.index.name = "period"
    return out

def compute_period_metrics(
    portfolio_df: pd.DataFrame,
    benchmark_returns: Optional[pd.Series] = None,
    risk_free_annual: float = 0.02,
    var_level: float = 0.95,
    periods: Tuple[str, ...] = ("1M", "3M", "YTD", "1Y", "ITD"),
) -> pd.DataFrame:
    """
    Compute metrics over multiple periods using `simple_returns`:

        - total_return
        - volatility (annualized)
        - sharpe (annualized)
        - sortino (annualized)
        - beta (vs benchmark_returns)
        - var (daily, historical, positive loss)
        - cvar (daily, historical, positive loss)
        - max_drawdown (from equity curve, negative number)

    periods: tuple of labels in {"1M", "3M", "YTD", "1Y", "ITD"}.

    Returns
    -------
    pd.DataFrame
        Index = period labels (e.g. "1M", "3M", "YTD", "1Y", "ITD").
    """
    if "simple_returns" not in portfolio_df.columns:
        raise ValueError("portfolio_df must contain a 'simple_returns' column")

    df = portfolio_df.sort_index()
    if df.empty:
        raise ValueError("portfolio_df is empty")

    r_all = df["simple_returns"]

    end_date = df.index.max()
    start_itd = df.index.min()

    metrics: Dict[str, Dict[str, float]] = {}

    def _metrics_for_slice(r_slice: pd.Series) -> Dict[str, float]:
        if r_slice.dropna().empty:
            return {
                k: np.nan
                for k in [
                    "total_return",
                    "volatility",
                    "sharpe",
                    "sortino",
                    "beta",
                    "var",
                    "cvar",
                    "max_drawdown",
                ]
            }

        total_ret = float((1.0 + r_slice).prod() - 1.0)
        vol = annualized_volatility(r_slice)
        sharpe = compute_sharpe_ratio(
            r_slice,
            risk_free_annual=risk_free_annual,
        )
        sortino = compute_sortino_ratio(
            r_slice,
            mar_daily=0.0,
            risk_free_annual=risk_free_annual,
        )
        beta = compute_beta(r_slice, benchmark_returns)
        var, cvar = compute_var_cvar(r_slice, level=var_level)
        mdd = compute_max_drawdown(r_slice)

        return {
            "total_return": total_ret,
            "volatility": vol,
            "sharpe": sharpe,
            "sortino": sortino,
            "beta": beta,
            "var": var,
            "cvar": cvar,
            "max_drawdown": mdd,
        }

    for p in periods:
        label = p.upper()

        if label == "ITD":
            start_date = start_itd
        elif label == "1Y":
            start_date = end_date - pd.DateOffset(years=1)
        elif label == "3M":
            start_date = end_date - pd.DateOffset(months=3)
        elif label == "1M":
            start_date = end_date - pd.DateOffset(months=1)
        elif label == "YTD":
            start_date = pd.Timestamp(year=end_date.year, month=1, day=1)
        else:
            raise ValueError("Unsupported period: {}".format(p))

        # Clamp to inception date
        start_date = max(start_date, start_itd)

        mask = (df.index >= start_date) & (df.index <= end_date)
        r_slice = r_all[mask]

        metrics[label] = _metrics_for_slice(r_slice)

    out = pd.DataFrame.from_dict(metrics, orient="index")
    out.index.name = "period"
    return out

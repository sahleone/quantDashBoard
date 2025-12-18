# KEEP 

from collections import defaultdict
from datetime import timedelta
from pathlib import Path
import json

import pandas as pd
import numpy as np
import yfinance as yf
# import matplotlib.pyplot as plt


# -------------------------------------------------------------
# 1. STOCK POSITIONS + STOCK VALUE (from BUY/SELL/REI/OPTIONS)
# -------------------------------------------------------------

def signed_units(act: dict) -> float:
    """
    Convert an activity record to a signed share quantity.

    SnapTrade conventions (typical):
    - BUY  : units > 0  (cash out)
    - SELL : units < 0  (cash in)
    - REI  : dividend reinvestment (treated as BUY of shares)
    - OPTIONEXPIRATION : closes position (negative units)

    We normalise:
      - SELL -> negative units
      - BUY/REI -> positive units
      - OPTIONEXPIRATION -> negative units (closes position)
      - other types -> 0 (no position change)
    """
    t = str(act.get("type", "")).upper()
    u = float(act.get("units", 0.0))

    if t == "SELL":
        return -abs(u)
    elif t in ("BUY", "REI"):
        return abs(u)
    elif t == "OPTIONEXPIRATION":
        # Option expiration closes the position (negative units)
        return -abs(u)
    else:
        return 0.0


def build_daily_positions_and_stock_value(activities):
    """
    From a list of SnapTrade activities, build:

    - positions_df: shares per symbol per calendar day (index = Timestamp, tz-naive)
    - stock_value:  total stock/ETF/etc. market value per day (Series)
    """
    activities = list(activities)
    if not activities:
        raise ValueError("No activities provided")

    transactions_by_date = defaultdict(lambda: defaultdict(float))

    POSITION_TYPES = {
        "BUY",
        "SELL",
        "REI",
        "OPTIONASSIGNMENT",
        "OPTIONEXERCISE",
        "OPTIONEXPIRATION",
    }

    for activity in activities:
        t = str(activity.get("type", "")).upper()
        if t not in POSITION_TYPES:
            continue

        sym_info = activity.get("symbol")
        if not sym_info or "symbol" not in sym_info:
            continue

        sym = sym_info["symbol"]

        trade_date_raw = activity.get("trade_date")
        if not trade_date_raw:
            continue

        trade_date = pd.to_datetime(trade_date_raw).date()
        units = signed_units(activity)
        if units == 0.0:
            continue

        transactions_by_date[trade_date][sym] += units

    if not transactions_by_date:
        raise ValueError("No BUY/SELL/REI/option transactions with symbols found in activities")

    all_symbols = {
        a["symbol"]["symbol"]
        for a in activities
        if a.get("symbol") and isinstance(a["symbol"], dict) and a["symbol"].get("symbol")
    }

    splits_data = {}
    for sym in all_symbols:
        try:
            s = yf.Ticker(sym).splits
        except Exception:
            continue

        if not s.empty:
            s.index = s.index.date
            splits_data[sym] = s

    all_dates = set(transactions_by_date.keys())
    for s in splits_data.values():
        all_dates.update(s.index)

    if not all_dates:
        raise ValueError("No dates found in transactions or splits.")

    min_date = min(all_dates)
    max_date = max(all_dates)
    date_range = pd.date_range(start=min_date, end=max_date, freq="D")

    cumulative_by_date = {}
    current_positions = {}

    for ts in date_range:
        current_date = ts.date()

        # splits
        for sym, split_series in splits_data.items():
            if current_date in split_series.index:
                factor = float(split_series.loc[current_date])
                if sym in current_positions:
                    current_positions[sym] *= factor

        # transactions
        if current_date in transactions_by_date:
            for sym, delta_units in transactions_by_date[current_date].items():
                new_units = current_positions.get(sym, 0.0) + delta_units
                if abs(new_units) < 1e-3:
                    current_positions.pop(sym, None)
                else:
                    current_positions[sym] = new_units

        cumulative_by_date[current_date] = current_positions.copy()

    positions_df = (
        pd.DataFrame.from_dict(cumulative_by_date, orient="index")
        .fillna(0.0)
        .sort_index()
    )
    positions_df.index = pd.to_datetime(positions_df.index)
    positions_df.index.name = "date"

    tickers = positions_df.columns.tolist()
    if not tickers:
        raise ValueError("No tickers found in positions_df")

    # Filter out option symbols (contain spaces) before fetching prices
    # Option symbols like "SPY   250422C00515000" will cause yfinance to fail
    def is_option_symbol(symbol):
        """Check if symbol is an option (contains spaces)"""
        return " " in str(symbol) and symbol.strip() != symbol.replace(" ", "")

    equity_tickers = [t for t in tickers if not is_option_symbol(t)]
    option_tickers = [t for t in tickers if is_option_symbol(t)]

    if not equity_tickers:
        # If only options, create empty price dataframe with same index
        price_df = pd.DataFrame(index=positions_df.index, columns=tickers)
        price_df = price_df.fillna(0.0)
    else:
        min_date, max_date = positions_df.index.min(), positions_df.index.max()

        try:
            price_df = yf.download(
                tickers=equity_tickers,
                start=min_date,
                end=max_date + timedelta(days=1),
                progress=False,
                auto_adjust=False,
            )["Close"]
        except Exception as e:
            raise ValueError(
                f"Failed to download prices from yfinance: {e}. "
                f"Tickers: {equity_tickers[:10]}{'...' if len(equity_tickers) > 10 else ''}"
            ) from e

        # Add option columns with price 0 (options not priced)
        if option_tickers:
            for opt_ticker in option_tickers:
                price_df[opt_ticker] = 0.0

        # Ensure all original tickers are present (in case some equity tickers failed)
        for ticker in tickers:
            if ticker not in price_df.columns:
                price_df[ticker] = 0.0

        # Handle case where yfinance returns a Series (single ticker)
        if isinstance(price_df, pd.Series):
            # Use the first equity ticker as column name (not tickers[0] which might be an option)
            price_df = price_df.to_frame(name=equity_tickers[0] if equity_tickers else tickers[0])

    price_df = price_df.reindex(positions_df.index).ffill()

    valued_positions = positions_df * price_df
    stock_value = valued_positions.sum(axis=1)
    stock_value.name = "stock_value"

    return positions_df, stock_value


# -------------------------------------------------------------
# 2. CASH SERIES + DEPOSITS/WITHDRAWALS (external flows)
# -------------------------------------------------------------

def build_cash_and_flows(activities):
    """
    Build:
      - cash_value:     running cash balance (starting from 0)
      - cash_flow_day:  net cash flow per day from ALL actions
      - ext_flow_day:   net external flow per day (CONTRIBUTION/DEPOSIT/WITHDRAWAL)
      - ext_flow_cum:   cumulative external flows (time series)
    """
    activities = list(activities)
    df = pd.DataFrame(activities)

    if df.empty:
        empty = pd.Series(dtype="float64")
        return (
            empty.rename("cash_value"),
            empty.rename("net_cash_flow"),
            empty.rename("external_flow"),
            empty.rename("external_flow_cumulative"),
        )

    if "trade_date" not in df.columns:
        raise ValueError("Expected 'trade_date' in activities")
    if "amount" not in df.columns:
        raise ValueError("Expected 'amount' in activities")
    if "type" not in df.columns:
        raise ValueError("Expected 'type' in activities")

    dt = pd.to_datetime(df["trade_date"])
    df["date"] = dt.dt.date
    df["date"] = pd.to_datetime(df["date"])

    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["type"] = df["type"].astype(str).str.upper()

    cash_flow_day = df.groupby("date")["amount"].sum().sort_index()
    cash_flow_day.name = "net_cash_flow"
    cash_value = cash_flow_day.cumsum()
    cash_value.name = "cash_value"

    EXT_TYPES = {"CONTRIBUTION", "DEPOSIT", "WITHDRAWAL"}
    ext = df[df["type"].isin(EXT_TYPES)].copy()

    if not ext.empty:
        ext.loc[ext["type"] == "WITHDRAWAL", "amount"] = -ext.loc[
            ext["type"] == "WITHDRAWAL", "amount"
        ].abs()
        ext.loc[ext["type"].isin({"CONTRIBUTION", "DEPOSIT"}), "amount"] = ext.loc[
            ext["type"].isin({"CONTRIBUTION", "DEPOSIT"})
        ]["amount"].abs()

        ext_flow_day = ext.groupby("date")["amount"].sum().sort_index()
        ext_flow_day.name = "external_flow"
        ext_flow_cum = ext_flow_day.cumsum()
        ext_flow_cum.name = "external_flow_cumulative"
    else:
        ext_flow_day = pd.Series(dtype="float64", name="external_flow")
        ext_flow_cum = pd.Series(dtype="float64", name="external_flow_cumulative")

    return cash_value, cash_flow_day, ext_flow_day, ext_flow_cum


# -------------------------------------------------------------
# 3. FULL PORTFOLIO TIMESERIES (RETURNS + EQUITY INDEX)
# -------------------------------------------------------------

def build_portfolio_timeseries(activities):
    """
    Build a portfolio timeseries with:

      - cash_value
      - stock_value
      - total_value = cash + stocks
      - deposit_withdrawal: net external flow per day
      - simple_returns: (V_curr - (V_prev + CF)) / (V_prev + CF)
      - cum_return: cumulative return per active segment (starts at 0 for each)
      - equity_index: normalized equity curve per segment (starts at 1 for each)

    Also returns:
      - positions_df (shares per symbol per day)
      - external_flows_total (scalar: net deposits/withdrawals)
    """
    # 1) Stocks
    positions_df, stock_value = build_daily_positions_and_stock_value(activities)

    # 2) Cash + external flows
    cash_value, cash_flow_day, ext_flow_day, ext_flow_cum = build_cash_and_flows(activities)

    # 3) Align on common date index
    idx = stock_value.index.union(cash_value.index)
    idx = idx.union(ext_flow_day.index)
    idx = idx.union(ext_flow_cum.index)
    idx = idx.sort_values()

    stock_value = stock_value.reindex(idx).ffill().fillna(0.0)
    cash_value = cash_value.reindex(idx).ffill().fillna(0.0)
    total_value = stock_value + cash_value

    # Per-day external flows (deposits/withdrawals), 0 where none
    ext_daily = ext_flow_day.reindex(idx).fillna(0.0)

    external_flows_ts = ext_flow_cum.reindex(idx).ffill().fillna(0.0)
    external_flows_total = external_flows_ts.iloc[-1] if len(external_flows_ts) else 0.0

    # 4) Daily simple returns:
    #    (new value - (prev day + cash flow)) / (prev day + cash flow)
    simple_returns = pd.Series(index=idx, dtype="float64")
    if len(idx) > 0:
        simple_returns.iloc[0] = 0.0
        for i in range(1, len(idx)):
            V_prev = total_value.iloc[i - 1]
            CF = ext_daily.iloc[i]          # net deposit/withdrawal for day i
            base = V_prev + CF              # (prev day value + cash flow)
            V_curr = total_value.iloc[i]    # new value

            if base <= 0:
                simple_returns.iloc[i] = 0.0
            else:
                simple_returns.iloc[i] = (V_curr - base) / base

    simple_returns.name = "simple_returns"

    # 5) Identify "alive" segments (account has non-trivial value)
    THRESH = 1e-3
    alive = total_value > THRESH

    # Start of a new alive segment = today alive, yesterday not alive
    start_seg = alive & ~alive.shift(fill_value=False)
    segment_id = start_seg.cumsum()
    segment_id[~alive] = 0  # 0 = dead periods

    cum_return = pd.Series(index=idx, dtype="float64")
    equity_index = pd.Series(index=idx, dtype="float64")

    # For each alive segment, compound returns separately
    for seg in range(1, int(segment_id.max()) + 1):
        mask = segment_id == seg
        if not mask.any():
            continue

        sr_seg = simple_returns[mask]

        # cumulative return (starts at 0)
        seg_cum = (1 + sr_seg).cumprod() - 1
        cum_return[mask] = seg_cum

        # equity index (starts at 1)
        seg_eq = (1 + sr_seg).cumprod()
        equity_index[mask] = seg_eq

    # Dead periods:
    # - cum_return: flat-lined (carry last value forward, start at 0 before first segment)
    cum_return = cum_return.ffill().fillna(0.0)
    # - equity_index: NaN for dead periods (so plots show gaps)
    equity_index[~alive] = np.nan

    cum_return.name = "cum_return"
    equity_index.name = "equity_index"

    # 6) Final portfolio DataFrame
    portfolio_df = pd.DataFrame(
        {
            "cash_value": cash_value,
            "stock_value": stock_value,
            "total_value": total_value,
            "deposit_withdrawal": ext_daily,
            "simple_returns": simple_returns,
            "cum_return": cum_return,
            "equity_index": equity_index,
        }
    )

    return (
        portfolio_df,
        positions_df,
        external_flows_total,
    )


# -------------------------------------------------------------
# 4. EXAMPLE USAGE + PLOTS
# -------------------------------------------------------------

if __name__ == "__main__":
    p = Path("activities.json")
    with p.open("r", encoding="utf-8") as f:
        data = json.load(f)

    activities = data["activities"]

    (
        portfolio_df,
        positions_df,
        external_flows_total,
    ) = build_portfolio_timeseries(activities)

    print("=== Portfolio (tail) ===")
    print(portfolio_df.tail())

    print("\nTotal cumulative external flows (net deposits/withdrawals):")
    print(external_flows_total)

    # ---------- Plots ----------

    # 1) Daily simple returns
    # plt.figure(figsize=(10, 3))
    portfolio_df["simple_returns"].plot()
    # plt.title("Daily Simple Returns (Flow-Adjusted)")
    # plt.xlabel("Date")
    # plt.ylabel("Return")
    # plt.grid(True)
    # plt.tight_layout()

    # 2) Cumulative return (segmented)
    # plt.figure(figsize=(10, 3))
    portfolio_df["cum_return"].plot()
    # plt.title("Cumulative Flow-Adjusted Return (Segmented)")
    # plt.xlabel("Date")
    # plt.ylabel("Cumulative Return")
    # plt.grid(True)
    # plt.tight_layout()

    # 3) Total value vs normalized equity index (scaled to start value)
    # plt.figure(figsize=(10, 3))
    portfolio_df["total_value"].plot(label="Total Value")

    # Scale equity_index so first non-NaN aligns with first non-zero total_value
    alive = portfolio_df["equity_index"].notna()
    if alive.any():
        first_idx = portfolio_df.index[alive.argmax()]
        scale_start_val = portfolio_df.loc[first_idx, "total_value"]
        (portfolio_df["equity_index"] * scale_start_val).plot(
            label="Equity Index (Flow-Neutral, Scaled)", linestyle="--"
        )

    # plt.title("Total Value vs Flow-Neutral Equity Index")
    # plt.xlabel("Date")
    # plt.ylabel("Value")
    # plt.legend()
    # plt.grid(True)
    # plt.tight_layout()

    # # plt.show()


# Modified version without matplotlib for comparison
from collections import defaultdict
from datetime import timedelta
from pathlib import Path
import json

import pandas as pd
import numpy as np
import yfinance as yf

# Import all the functions from activities.py
import sys
import importlib.util

# Load the original activities.py module
spec = importlib.util.spec_from_file_location("activities", "activities.py")
activities_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activities_module)

# Use functions from the module
build_portfolio_timeseries = activities_module.build_portfolio_timeseries

if __name__ == "__main__":
    p = Path("activities.json")
    with p.open("r", encoding="utf-8") as f:
        data = json.load(f)

    activities = data["activities"]

    print(f"Processing {len(activities)} activities...")
    
    (
        portfolio_df,
        positions_df,
        external_flows_total,
    ) = build_portfolio_timeseries(activities)

    print("\n=== Portfolio Timeseries (last 20 rows) ===")
    print(portfolio_df.tail(20).to_string())

    print("\n=== Portfolio Summary ===")
    print(f"Date range: {portfolio_df.index.min()} to {portfolio_df.index.max()}")
    print(f"Total days: {len(portfolio_df)}")
    print(f"\nLast row values:")
    last_row = portfolio_df.iloc[-1]
    print(f"  Date: {portfolio_df.index[-1]}")
    print(f"  Total Value: ${last_row['total_value']:.2f}")
    print(f"  Cash Value: ${last_row['cash_value']:.2f}")
    print(f"  Stock Value: ${last_row['stock_value']:.2f}")
    print(f"  Simple Returns: {last_row['simple_returns']:.6f}")
    print(f"  Cum Return: {last_row['cum_return']:.6f}")
    print(f"  Equity Index: {last_row['equity_index']:.6f}")

    print("\n=== External Flows ===")
    print(f"Total cumulative external flows (net deposits/withdrawals): ${external_flows_total:.2f}")

    print("\n=== Statistics ===")
    print(f"Total Value - Min: ${portfolio_df['total_value'].min():.2f}, Max: ${portfolio_df['total_value'].max():.2f}, Mean: ${portfolio_df['total_value'].mean():.2f}")
    print(f"Cash Value - Min: ${portfolio_df['cash_value'].min():.2f}, Max: ${portfolio_df['cash_value'].max():.2f}, Mean: ${portfolio_df['cash_value'].mean():.2f}")
    print(f"Stock Value - Min: ${portfolio_df['stock_value'].min():.2f}, Max: ${portfolio_df['stock_value'].max():.2f}, Mean: ${portfolio_df['stock_value'].mean():.2f}")
    
    if portfolio_df['simple_returns'].notna().any():
        returns = portfolio_df['simple_returns'].dropna()
        print(f"Returns - Count: {len(returns)}, Mean: {returns.mean():.6f}, Std: {returns.std():.6f}")
        print(f"Returns - Min: {returns.min():.6f}, Max: {returns.max():.6f}")

    # Save to CSV for comparison
    portfolio_df.to_csv("portfolio_python.csv")
    print("\n✓ Saved portfolio timeseries to portfolio_python.csv")


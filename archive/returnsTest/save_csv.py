from pathlib import Path
import json
import sys
sys.path.insert(0, ".")
from activities import build_portfolio_timeseries

p = Path("activities.json")
with p.open("r", encoding="utf-8") as f:
    data = json.load(f)

activities = data["activities"]
portfolio_df, positions_df, external_flows_total = build_portfolio_timeseries(activities)

portfolio_df.to_csv("portfolio_python.csv")
print(f"✓ Saved {len(portfolio_df)} rows to portfolio_python.csv")
print(f"Last date: {portfolio_df.index[-1]}")
last_cash = portfolio_df.iloc[-1]["cash_value"]
last_stock = portfolio_df.iloc[-1]["stock_value"]
last_total = last_cash + last_stock
print(f"Last cash_value: ${last_cash:.2f}")
print(f"Last stock_value: ${last_stock:.2f}")
print(f"Last total_value: ${last_total:.2f}")
print(f"External flows: ${external_flows_total:.2f}")

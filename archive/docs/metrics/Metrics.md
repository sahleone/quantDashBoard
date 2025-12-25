# Portfolio Metrics Reference

## Table of Contents

1. [Portfolio Snapshot](#1-portfolio-snapshot)  
   1.1 [Assets Under Management (AUM)](#11-assets-under-management-aum)  
   1.2 [Asset Allocation & Diversification](#12-asset-allocation--diversification)  
   1.3 [Income: Dividends & Interest](#13-income-dividends--interest)  

2. [Returns & Performance](#2-returns--performance)  
   2.1 [Point-to-Point Returns / ROI](#21-point-to-point-returns--roi)  
   2.2 [Annualized Return (CAGR)](#22-annualized-return-cagr)  
   2.3 [(Optional) Time-Weighted Return (TWR)](#23-optional-time-weighted-return-twr)  

3. [Risk-Adjusted Performance](#3-risk-adjusted-performance)  
   3.1 [Sharpe Ratio](#31-sharpe-ratio)  
   3.2 [Sortino Ratio](#32-sortino-ratio)  
   3.3 [Return / Max Drawdown](#33-return--max-drawdown)  

4. [Risk & Drawdowns](#4-risk--drawdowns)  
   4.1 [Volatility](#41-volatility)  
   4.2 [Beta](#42-beta)  
   4.3 [Drawdown Metrics](#43-drawdown-metrics)  
   4.4 [Tail Risk: VaR & CVaR](#44-tail-risk-var--cvar)  

5. [Diversification, Correlation & Cointegration](#5-diversification-correlation--cointegration)  
   5.1 [Correlation](#51-correlation)  
   5.2 [(Advanced) Cointegration](#52-advanced-cointegration)  

6. [Advanced / Future Extras](#6-advanced--future-extras)  

---

## Notation

- \( V_t \): portfolio value at time \( t \)  
- \( V_{i,t} \): value of asset \( i \) at time \( t \)  
- \( C_t \): net external cash flow at time \( t \) (contributions – withdrawals; may or may not include dividends/interest depending on definition)  
- \( r_t \): simple portfolio return in period \( t \)  
- \( r_{p,t} \): portfolio return in period \( t \)  
- \( r_{m,t} \): benchmark/market return in period \( t \)  
- \( r_{f,t} \): risk-free rate in period \( t \)  
- \( R_f \): annual risk-free rate  
- All “annualized” metrics typically assume 252 trading days per year when using daily data.

---

## 1. Portfolio Snapshot

### 1.1 Assets Under Management (AUM)

Total AUM at time \( t \):

\[
\text{AUM}_t = \sum_{i=1}^{N} V_{i,t}
\]

Endpoints:
- GET /api/accounts/balance
- GET /api/accounts/positions
- /api/snaptrade/options/holdings
- 
---

### 1.2 Asset Allocation & Diversification

**Weight of asset / class / industry \( i \) at time \( t \):**

\[
w_{i,t} = \frac{V_{i,t}}{\sum_{j=1}^{N} V_{j,t}} = \frac{V_{i,t}}{\text{AUM}_t}
\]

**Herfindahl–Hirschman Index (HHI) of concentration:**

\[
\text{HHI}_t = \sum_{i=1}^{N} w_{i,t}^2
\]

**Simple diversification score (optional):**

\[
\text{DiversificationScore}_t = 1 - \text{HHI}_t
\]

Endpoints:
- /api/accounts/balances
- /api/accounts/positions
- /api/snaptrade/options/holdings
- yahoo? for industry


---

### 1.3 Income: Dividends & Interest

Let:

- \(\text{Div}_t\): dividend cash received at time \(t\)  
- \(\text{Int}_t\): interest cash received at time \(t\)

#### 1.3.1 Dividend Income

**Total dividend income over \([0, T]\):**

\[
\text{DivIncome}_{[0,T]} = \sum_{t=1}^{T} \text{Div}_t
\]

**Monthly dividend income for month \( m \):**

\[
\text{DivIncome}_{m} = \sum_{t \in m} \text{Div}_t
\]

**Dividend yield over \([0, T]\):**

\[
\text{DivYield}_{[0,T]}
= \frac{\text{DivIncome}_{[0,T]}}
       {\text{AveragePortfolioValue}_{[0,T]}}
\]

---

#### 1.3.2 Interest Income

**Total interest income over \([0, T]\):**

\[
\text{IntIncome}_{[0,T]} = \sum_{t=1}^{T} \text{Int}_t
\]

**Monthly interest income for month \( m \):**

\[
\text{IntIncome}_{m} = \sum_{t \in m} \text{Int}_t
\]

**Interest yield over \([0, T]\):**

\[
\text{IntYield}_{[0,T]}
= \frac{\text{IntIncome}_{[0,T]}}
       {\text{AveragePortfolioValue}_{[0,T]}}
\]

---

#### 1.3.3 Total Income (Dividends + Interest)

**Total income over \([0, T]\):**

\[
\text{TotalIncome}_{[0,T]}
= \text{DivIncome}_{[0,T]} + \text{IntIncome}_{[0,T]}
= \sum_{t=1}^{T} \left( \text{Div}_t + \text{Int}_t \right)
\]

**Monthly total income for month \( m \):**

\[
\text{TotalIncome}_{m}
= \text{DivIncome}_{m} + \text{IntIncome}_{m}
= \sum_{t \in m} \left( \text{Div}_t + \text{Int}_t \right)
\]

**Total income yield over \([0, T]\):**

\[
\text{TotalIncomeYield}_{[0,T]}
= \frac{\text{TotalIncome}_{[0,T]}}
       {\text{AveragePortfolioValue}_{[0,T]}}
\]

Endpoint:
-  /api/accounts/activities

---

## 2. Returns & Performance

### 2.1 Point-to-Point Returns / ROI

**Simple period return from \( V_0 \) to \( V_T \) (ignoring flows):**

\[
R_{\text{simple}} = \frac{V_T}{V_0} - 1
\]

If using a series of periodic (e.g., daily) returns \( r_t \):

\[
R_{[0,T]} = \prod_{t=1}^{T} (1 + r_t) - 1
\]

This can be applied in rolling windows for:

- 1M, 3M, YTD, 1Y, ITD, etc.

**Return with external flows (generic structure):**

A very general “money-weighted” ROI-esque metric can be written as:

\[
R_{\text{net}} = 
\frac{V_T - \sum_{t=1}^{T} C_t}
    {V_0 + \sum_{t=1}^{T} C_t \cdot w_t}
\]

where \( w_t \) is a weighting factor representing how long each flow is invested.

---

### 2.2 Annualized Return (CAGR)

Given \( V_0 \) and \( V_T \) over \( Y \) years:

\[
\text{CAGR} = \left( \frac{V_T}{V_0} \right)^{1/Y} - 1
\]

Using periodic returns (e.g., daily) with \( T \) observations:

\[
\text{CAGR} =
\left( \prod_{t=1}^{T} (1 + r_t) \right)^{\frac{252}{T}} - 1
\]

---

### 2.3 (Optional) Time-Weighted Return (TWR)

1. Split the full horizon into \( K \) subperiods, each starting immediately **after** a cash flow and ending immediately **before** the next cash flow.
2. For each subperiod \( k \), with value \( V_{k-1} \) at the start and \( V_k \) at the end (no flows inside):

\[
R_k = \frac{V_k}{V_{k-1}} - 1
\]

3. Time-weighted return over the full period:

\[
\text{TWR} = \prod_{k=1}^{K} (1 + R_k) - 1
\]

Annualized TWR over \( Y \) years:

\[
\text{TWR}_{\text{annual}} = (1 + \text{TWR})^{1/Y} - 1
\]

---

## 3. Risk-Adjusted Performance

Let \( r_t \) be periodic portfolio returns and \( r_{f,t} \) the periodic risk-free rate.

Mean portfolio return:

\[
\overline{r} = \frac{1}{T} \sum_{t=1}^{T} r_t
\]

Mean excess return:

\[
\overline{r_e} = \frac{1}{T} \sum_{t=1}^{T} (r_t - r_{f,t})
\]

---

### 3.1 Sharpe Ratio

Using periodic returns:

\[
\text{Sharpe} = \frac{\overline{r} - \overline{r_f}}{\sigma_r}
\]

where:

- \( \overline{r} \): mean portfolio return per period  
- \( \overline{r_f} \): mean risk-free rate per period  
- \( \sigma_r \): standard deviation of portfolio returns per period.

For daily data with a constant annual risk-free rate \( R_f \):

\[
\text{Sharpe}
\approx
\frac{\overline{r} - \frac{R_f}{252}}{\sigma_r}
\sqrt{252}
\]

---

### 3.2 Sortino Ratio

Let MAR be the Minimum Acceptable Return (often 0 or risk-free). Downside deviation:

\[
\sigma_{\text{down}} =
\sqrt{
  \frac{1}{T_d}
  \sum_{t : r_t < \text{MAR}} (r_t - \text{MAR})^2
}
\]

where \( T_d \) is the number of periods with \( r_t < \text{MAR} \).

Sortino ratio:

\[
\text{Sortino} =
\frac{\overline{r} - \text{MAR}}{\sigma_{\text{down}}}
\]

---

### 3.3 Return / Max Drawdown

Let \( \text{Return}_{\text{period}} \) be total or annualized return over a chosen horizon, and \( \text{MaxDD} \) be the **magnitude** of maximum drawdown (positive value).

\[
\text{Return/MaxDD} =
\frac{\text{Return}_{\text{period}}}{\text{MaxDD}}
\]

---

## 4. Risk & Drawdowns

### 4.1 Volatility

Sample standard deviation of periodic returns:

\[
\sigma_{\text{period}} =
\sqrt{
  \frac{1}{T - 1}
  \sum_{t=1}^{T} (r_t - \overline{r})^2
}
\]

Annualized volatility for daily data:

\[
\sigma_{\text{annual}} = \sigma_{\text{daily}} \sqrt{252}
\]

---

### 4.2 Beta

Using portfolio returns \( r_{p,t} \) and benchmark returns \( r_{m,t} \):

\[
\beta
= \frac{\text{Cov}(r_p, r_m)}{\text{Var}(r_m)}
= \frac{\sum_{t=1}^{T} (r_{p,t} - \overline{r_p})(r_{m,t} - \overline{r_m})}
       {\sum_{t=1}^{T} (r_{m,t} - \overline{r_m})^2}
\]

---

### 4.3 Drawdown Metrics

Let \( E_t \) be the equity curve (portfolio value or normalized to 1.0 at start).

Running peak:

\[
\text{Peak}_t = \max_{1 \le s \le t} E_s
\]

Drawdown at time \( t \):

\[
\text{DD}_t = \frac{E_t - \text{Peak}_t}{\text{Peak}_t}
\]

Maximum drawdown over the full period:

\[
\text{MaxDD} = \min_t \text{DD}_t
\]

---

### 4.4 Tail Risk: VaR & CVaR

Define loss as \( L_t = -r_t \) (positive value represents a loss).

#### Historical VaR

At confidence level \( \alpha \) (e.g., 95%):

1. Sort historical losses \( L_t \) in ascending order.
2. Value-at-Risk is the empirical \( \alpha \)-quantile:

\[
\text{VaR}_{\alpha}
= \text{quantile}_{\alpha}(L)
\]

#### Parametric (Gaussian) VaR

If returns are modeled as normal with mean \( \mu \) and standard deviation \( \sigma \):

\[
\text{VaR}_{\alpha}
= -\left(\mu + z_{\alpha} \sigma \right)
\]

where \( z_{\alpha} \) is the standard normal quantile.

#### Conditional VaR (CVaR) / Expected Shortfall

Expected loss conditional on being beyond VaR:

\[
\text{CVaR}_{\alpha}
= \mathbb{E}[L \mid L \ge \text{VaR}_{\alpha}]
\]

Historical estimate:

\[
\text{CVaR}_{\alpha}
= \frac{1}{N_{\text{tail}}}
\sum_{t : L_t \ge \text{VaR}_{\alpha}} L_t
\]

---

## 5. Diversification, Correlation & Cointegration

### 5.1 Correlation

For two return series \( X_t \) and \( Y_t \):

\[
\rho_{X,Y}
= \frac{\text{Cov}(X, Y)}{\sigma_X \sigma_Y}
= \frac{\sum_{t=1}^{T} (X_t - \overline{X})(Y_t - \overline{Y})}
       {\sqrt{\sum_{t=1}^{T} (X_t - \overline{X})^2}\,\sqrt{\sum_{t=1}^{T} (Y_t - \overline{Y})^2}}
\]

---

### 5.2 (Advanced) Cointegration

For two price series \( P^{(1)}_t \) and \( P^{(2)}_t \):

1. Estimate a long-run linear relationship (e.g., OLS):

\[
P^{(1)}_t = \alpha + \beta P^{(2)}_t + \varepsilon_t
\]

2. Residuals:

\[
\varepsilon_t = P^{(1)}_t - (\alpha + \beta P^{(2)}_t)
\]

3. If \( \varepsilon_t \) is stationary (e.g., passes an ADF test), the series are cointegrated and the spread can be defined as:

\[
S_t = \varepsilon_t
\]

Standardized spread (z-score):

\[
z_t = \frac{S_t - \overline{S}}{\sigma_S}
\]

---

## 6. Advanced / Future Extras

### 6.1 Calmar Ratio

\[
\text{Calmar} = \frac{\text{CAGR}}{|\text{MaxDD}|}
\]

### 6.2 Information Ratio (IR)

With active returns \( a_t = r_{p,t} - r_{m,t} \):

\[
\text{IR} = \frac{\overline{a}}{\sigma_a}
\]

### 6.3 Turnover

For trading period \( t \), let \( \text{BuyValue}_t \) be the total value bought, and \( \text{SellValue}_t \) the total value sold.

\[
\text{Turnover} = \frac{\sum_{t} \min(\text{BuyValue}_t, \text{SellValue}_t)}{\text{AverageAUM}}
\]

---

**End of Document**
import { useState, useEffect, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import UserContext from "../../context/Usercontext";
import { authenticatedGet } from "../../utils/apiClient";

const formatCurrency = (value, currency = "USD") => {
  if (value === null || value === undefined) {
    return "—";
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(numericValue);
  } catch (error) {
    console.error("Currency format error:", error);
    return numericValue.toFixed
      ? numericValue.toFixed(2)
      : String(numericValue);
  }
};

const formatNumber = (value) => {
  if (value === null || value === undefined) {
    return "—";
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(numericValue);
};

const formatPercent = (value) => {
  if (value === null || value === undefined) {
    return "—";
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
};

function Portfolio() {
  const { userId } = useContext(UserContext);
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState({ accounts: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedAccountId, setExpandedAccountId] = useState(null);
  const [optionsByAccount, setOptionsByAccount] = useState({});
  const [optionsLoadingByAccount, setOptionsLoadingByAccount] = useState({});

  useEffect(() => {
    const fetchPortfolio = async () => {
      if (!userId) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await authenticatedGet(
          "http://localhost:3000/api/snaptrade/portfolio"
        );

        setPortfolio(response.data || { accounts: [], summary: null });
      } catch (fetchError) {
        console.error("Error fetching portfolio:", fetchError);

        const status = fetchError?.response?.status;

        if (status === 404) {
          setPortfolio({ accounts: [], summary: null });
          setError(null);
        } else if (status === 403) {
          setError("You do not have access to this portfolio.");
          setPortfolio({ accounts: [], summary: null });
        } else {
          setError("Unable to load portfolio positions right now.");
          setPortfolio({ accounts: [], summary: null });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolio();
  }, [userId]);

  // Fetch options for an account when expanded. If there are no DB entries for
  // today the server will call SnapTrade and populate the DB before returning.
  useEffect(() => {
    const fetchOptionsForAccount = async (accountId) => {
      if (!accountId) return;
      setOptionsLoadingByAccount((s) => ({ ...s, [accountId]: true }));
      try {
        const resp = await authenticatedGet(
          `http://localhost:3000/api/snaptrade/options/dbholdings?accountId=${encodeURIComponent(
            accountId
          )}`
        );
        const holdings = resp?.data?.holdings || [];
        setOptionsByAccount((s) => ({ ...s, [accountId]: holdings }));
      } catch (err) {
        console.error("Error fetching options for account", accountId, err);
        setOptionsByAccount((s) => ({ ...s, [accountId]: [] }));
      } finally {
        setOptionsLoadingByAccount((s) => ({ ...s, [accountId]: false }));
      }
    };

    if (expandedAccountId) {
      // Only fetch if we don't already have data for this account today
      const existing = optionsByAccount[expandedAccountId];
      if (!existing) {
        fetchOptionsForAccount(expandedAccountId);
      }
    }
  }, [expandedAccountId, optionsByAccount]);

  const flattenedPositions = useMemo(() => {
    if (!portfolio?.accounts?.length) {
      return [];
    }

    return portfolio.accounts.flatMap((account) =>
      (account.positions || []).map((position) => ({
        accountId: account.accountId,
        accountName: account.accountName,
        currency: position.currency || account.currency || "USD",
        symbol: position.symbol,
        name: position.name,
        units: position.units ?? position.lots,
        costBasis: position.costBasis,
        marketValue: position.marketValue,
        unrealizedPnl: position.unrealizedPnl,
        averagePrice: position.averagePrice,
        marketPrice: position.marketPrice,
      }))
    );
  }, [portfolio]);

  const accountSummaries = useMemo(() => {
    if (!portfolio?.accounts?.length) return [];

    return portfolio.accounts.map((account) => {
      const positions = account.positions || [];

      const totalMarketValue = positions.reduce((sum, p) => {
        const v = Number(p?.marketValue ?? 0);
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0);

      const totalCostBasis = positions.reduce((sum, p) => {
        const v = Number(p?.costBasis ?? 0);
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0);

      const unrealizedPnl = positions.reduce((sum, p) => {
        const v = Number(
          p?.unrealizedPnl ??
            Number(p?.marketValue ?? 0) - Number(p?.costBasis ?? 0)
        );
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0);

      return {
        accountId: account.accountId,
        accountName: account.accountName || account.accountId,
        currency: account.currency || "USD",
        totalMarketValue,
        totalCostBasis,
        unrealizedPnl,
        positions,
      };
    });
  }, [portfolio]);

  const toggleAccount = (accountId) => {
    setExpandedAccountId((prev) => (prev === accountId ? null : accountId));
  };

  // Reusable positions table to avoid duplicate table markup
  const PositionsTable = ({
    positions,
    currency = "USD",
    showAccount = false,
  }) => {
    return (
      <div className="portfolio-table-wrapper">
        <table className="portfolio-table">
          <thead>
            <tr>
              {showAccount && <th>Account</th>}
              <th>Symbol</th>
              <th>Name</th>
              <th>Units</th>
              <th>Avg Price</th>
              <th>Market Price</th>
              <th>Market Value</th>
              <th>Unrealized P/L</th>
              <th>Return %</th>
            </tr>
          </thead>
          <tbody>
            {(positions || []).map((position) => {
              const units = position.units ?? position.lots ?? 0;
              const pnlClass =
                position.unrealizedPnl > 0
                  ? "pnl-positive"
                  : position.unrealizedPnl < 0
                  ? "pnl-negative"
                  : "";

              const returnRatio =
                position.costBasis && position.costBasis !== 0
                  ? (position.marketValue - position.costBasis) /
                    position.costBasis
                  : null;

              const cellCurrency = position.currency || currency || "USD";

              return (
                <tr key={`${position.accountId ?? "acct"}-${position.symbol}`}>
                  {showAccount && (
                    <td className="account-cell">
                      {position.accountName ?? position.accountId}
                    </td>
                  )}
                  <td>{position.symbol}</td>
                  <td>{position.name}</td>
                  <td>{formatNumber(units)}</td>
                  <td>{formatCurrency(position.averagePrice, cellCurrency)}</td>
                  <td>{formatCurrency(position.marketPrice, cellCurrency)}</td>
                  <td>{formatCurrency(position.marketValue, cellCurrency)}</td>
                  <td className={pnlClass}>
                    {formatCurrency(position.unrealizedPnl, cellCurrency)}
                  </td>
                  <td className={pnlClass}>
                    {returnRatio !== null ? formatPercent(returnRatio) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const OptionsTable = ({ options = [], currency = "USD" }) => {
    return (
      <div className="portfolio-table-wrapper">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Type</th>
              <th>Strike</th>
              <th>Exp</th>
              <th>Units</th>
              <th>Avg Price</th>
              <th>Price</th>
              <th>Market Value</th>
            </tr>
          </thead>
          <tbody>
            {(options || []).map((opt, idx) => {
              const ticker =
                opt?.symbol?.option_symbol?.ticker ||
                opt?.symbol?.option_symbol?.underlying_symbol?.symbol ||
                "";
              const type = opt?.symbol?.option_symbol?.option_type || "";
              const strike = opt?.symbol?.option_symbol?.strike_price ?? null;
              const exp = opt?.symbol?.option_symbol?.expiration_date || "";
              const units = Number(opt?.units ?? 0);
              const avg =
                opt?.average_purchase_price ??
                opt?.averagePurchasePrice ??
                null;
              const price = opt?.price ?? null;
              const marketValue = price !== null ? price * units : null;

              const cellCurrency = opt?.currency?.code || currency || "USD";

              return (
                <tr key={`${opt._id ?? idx}-${ticker}`}>
                  <td>{ticker}</td>
                  <td>{type}</td>
                  <td>{strike !== null ? strike : "—"}</td>
                  <td>{exp}</td>
                  <td>{formatNumber(units)}</td>
                  <td>{formatCurrency(avg, cellCurrency)}</td>
                  <td>{formatCurrency(price, cellCurrency)}</td>
                  <td>
                    {marketValue !== null
                      ? formatCurrency(marketValue, cellCurrency)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Show loading or redirect if not authenticated
  if (!userId) {
    return (
      <div className="portfolio">
        <div className="portfolio-writeup">
          <h1>Portfolio</h1>
          <p>Please log in to view your portfolio.</p>
          <button onClick={() => navigate("/")}>Go to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="portfolio">
      <div className="portfolio-writeup">
        <h1>Portfolio</h1>
      </div>

      <div className="portfolio-content">
        {loading ? (
          <div className="portfolio-status">Loading your portfolio...</div>
        ) : error ? (
          <div className="portfolio-status portfolio-status--error">
            {error}
          </div>
        ) : flattenedPositions.length === 0 ? (
          <div className="portfolio-status">No positions available.</div>
        ) : (
          <div>
            {expandedAccountId ? (
              // Single-account holdings view with back button
              (() => {
                const acc = accountSummaries.find(
                  (a) => a.accountId === expandedAccountId
                );

                if (!acc) return null;

                const pnlColor =
                  acc.unrealizedPnl > 0
                    ? "#0a8a00"
                    : acc.unrealizedPnl < 0
                    ? "#d32f2f"
                    : "#333";

                return (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: 12,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedAccountId(null)}
                        style={{
                          marginRight: 12,
                          padding: "8px 12px",
                          borderRadius: 6,
                          border: "1px solid #ddd",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        ← Back
                      </button>

                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>
                          {acc.accountName}
                        </div>
                        <div style={{ fontSize: 13, color: "#666" }}>
                          {formatCurrency(acc.totalMarketValue, acc.currency)} •{" "}
                          <span style={{ color: pnlColor }}>
                            {formatCurrency(acc.unrealizedPnl, acc.currency)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/** Options table appears above other holdings when present */}
                    {optionsLoadingByAccount[acc.accountId] ? (
                      <div style={{ marginBottom: 12 }}>Loading options...</div>
                    ) : (
                      (optionsByAccount[acc.accountId] || []).length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              marginBottom: 8,
                            }}
                          >
                            Options
                          </div>
                          <OptionsTable
                            options={optionsByAccount[acc.accountId]}
                            currency={acc.currency}
                          />
                        </div>
                      )
                    )}

                    <PositionsTable
                      positions={acc.positions}
                      currency={acc.currency}
                    />
                  </div>
                );
              })()
            ) : (
              // Cards list + flattened table
              <>
                <div style={{ marginBottom: 16 }}>
                  {accountSummaries.map((acc) => (
                    <div key={acc.accountId} style={{ marginBottom: 12 }}>
                      <button
                        type="button"
                        onClick={() => toggleAccount(acc.accountId)}
                        className="account-card"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: 16,
                          width: "100%",
                          borderRadius: 8,
                          border: "1px solid #e6e6e6",
                          background: "#fff",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontSize: 16, fontWeight: 600 }}>
                            {acc.accountName}
                          </div>
                          <div style={{ fontSize: 12, color: "#666" }}>
                            {acc.accountId}
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 16, fontWeight: 600 }}>
                            {formatCurrency(acc.totalMarketValue, acc.currency)}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              color:
                                acc.unrealizedPnl > 0
                                  ? "#0a8a00"
                                  : acc.unrealizedPnl < 0
                                  ? "#d32f2f"
                                  : "#333",
                            }}
                          >
                            {formatCurrency(acc.unrealizedPnl, acc.currency)}
                          </div>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Portfolio;

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

  // userId comes from UserContext (set on login). With cookie-based auth the
  // server maintains the JWT cookie and the client uses userId for UI state.

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
          <div className="portfolio-table-wrapper">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Units</th>
                  <th>Avg Price</th>
                  <th>Cost Basis</th>
                  <th>Market Price</th>
                  <th>Market Value</th>
                  <th>Unrealized P/L</th>
                  <th>Return %</th>
                </tr>
              </thead>
              <tbody>
                {flattenedPositions.map((position) => {
                  const units = position.units ?? 0;
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

                  return (
                    <tr key={`${position.accountId}-${position.symbol}`}>
                      <td className="account-cell">{position.accountName}</td>
                      <td>{position.symbol}</td>
                      <td>{position.name}</td>
                      <td>{formatNumber(units)}</td>
                      <td>
                        {formatCurrency(
                          position.averagePrice,
                          position.currency
                        )}
                      </td>
                      <td>
                        {formatCurrency(position.costBasis, position.currency)}
                      </td>
                      <td>
                        {formatCurrency(
                          position.marketPrice,
                          position.currency
                        )}
                      </td>
                      <td>
                        {formatCurrency(
                          position.marketValue,
                          position.currency
                        )}
                      </td>
                      <td className={pnlClass}>
                        {formatCurrency(
                          position.unrealizedPnl,
                          position.currency
                        )}
                      </td>
                      <td className={pnlClass}>
                        {returnRatio !== null
                          ? formatPercent(returnRatio)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Portfolio;

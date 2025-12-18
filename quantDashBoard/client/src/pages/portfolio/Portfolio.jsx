import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import UserContext from "../../context/UserContext";
import { authenticatedGet } from "../../utils/apiClient";
import "./Portfolio.css";

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

function Portfolio() {
  const { userId } = useContext(UserContext);
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [accountBalances, setAccountBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedAccountId, setExpandedAccountId] = useState(null);
  const [accountPositions, setAccountPositions] = useState({});
  const [accountOptions, setAccountOptions] = useState({});
  const [loadingPositions, setLoadingPositions] = useState({});

  useEffect(() => {
    const fetchPortfolioData = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch accounts from DB
        const accountsResponse = await authenticatedGet("/api/accounts");
        const accountsList = accountsResponse?.data?.accounts || [];
        setAccounts(accountsList);

        // Calculate portfolio balance for each account
        const balances = {};

        for (const account of accountsList) {
          let totalValue = 0;
          let cashValue = 0;
          let positionsValue = 0;
          let optionsValue = 0;

          // Get cash from balances
          try {
            const balancesRes = await authenticatedGet(
              `/api/accounts/balances?accountId=${encodeURIComponent(
                account.accountId
              )}`
            );
            const balancesArray =
              balancesRes?.data?.balances || balancesRes?.data || [];

            if (Array.isArray(balancesArray)) {
              cashValue = balancesArray.reduce((sum, balance) => {
                return sum + Number(balance.cash || 0);
              }, 0);
            } else if (balancesRes?.data?.totals?.cash) {
              cashValue = Number(balancesRes.data.totals.cash || 0);
            }
          } catch (balanceErr) {
            console.warn(
              `Could not fetch balances for account ${account.accountId}:`,
              balanceErr
            );
          }

          // Get positions and calculate market value
          try {
            const positionsRes = await authenticatedGet(
              `/api/snaptrade/positions?accountId=${encodeURIComponent(
                account.accountId
              )}`
            );
            const positions = positionsRes?.data?.positions || [];

            for (const position of positions) {
              const units = Number(position.units || 0);
              const price = Number(position.price || 0);
              const marketValue = units * price;

              if (Number.isFinite(marketValue) && marketValue > 0) {
                // Check if it's cash equivalent
                if (position.cashEquivalent || position.cash_equivalent) {
                  cashValue += marketValue;
                } else {
                  positionsValue += marketValue;
                }
              } else if (position.marketValue) {
                // Use marketValue if provided directly
                const mv = Number(position.marketValue);
                if (Number.isFinite(mv) && mv > 0) {
                  if (position.cashEquivalent || position.cash_equivalent) {
                    cashValue += mv;
                  } else {
                    positionsValue += mv;
                  }
                }
              }
            }
          } catch (positionsErr) {
            console.warn(
              `Could not fetch positions for account ${account.accountId}:`,
              positionsErr
            );
          }

          // Get options and calculate market value
          try {
            const optionsRes = await authenticatedGet(
              `/api/snaptrade/options/holdings?accountId=${encodeURIComponent(
                account.accountId
              )}`
            );
            const optionPositions =
              optionsRes?.data?.holdings || optionsRes?.data || [];

            if (Array.isArray(optionPositions)) {
              for (const option of optionPositions) {
                const apiMarketValue = Number(
                  option.market_value || option.marketValue || 0
                );

                if (apiMarketValue > 0) {
                  optionsValue += Math.abs(apiMarketValue);
                  continue;
                }

                const price = Number(option.price || 0);
                const units = Number(option.units || 0);

                if (price > 0 && units !== 0) {
                  const isMiniOption =
                    option.symbol?.option_symbol?.is_mini_option ||
                    option.is_mini_option ||
                    false;
                  const contractMultiplier = isMiniOption ? 10 : 100;
                  const optionMarketValue =
                    price * Math.abs(units) * contractMultiplier;
                  optionsValue += optionMarketValue;
                }
              }
            }
          } catch (optionsErr) {
            console.warn(
              `Could not fetch option positions for account ${account.accountId}:`,
              optionsErr
            );
          }

          totalValue = cashValue + positionsValue + optionsValue;

          // Extract currency string - handle both string and object cases
          let currencyStr = "USD";
          if (typeof account.currency === "string") {
            currencyStr = account.currency;
          } else if (account.currency?.code) {
            currencyStr = account.currency.code;
          }

          balances[account.accountId] = {
            totalValue,
            cashValue,
            positionsValue,
            optionsValue,
            currency: currencyStr,
          };
        }

        setAccountBalances(balances);
      } catch (err) {
        console.error("Error fetching portfolio data:", err);
        setError(
          err?.response?.data?.error?.message ||
            err?.message ||
            "Failed to load portfolio data"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolioData();
  }, [userId]);

  // Fetch positions and options when account is expanded
  useEffect(() => {
    const fetchAccountDetails = async (accountId) => {
      if (!accountId) return;

      setLoadingPositions((prev) => ({ ...prev, [accountId]: true }));

      try {
        // Fetch positions
        const positionsRes = await authenticatedGet(
          `/api/snaptrade/positions?accountId=${encodeURIComponent(accountId)}`
        );
        const positions = positionsRes?.data?.positions || [];
        setAccountPositions((prev) => ({ ...prev, [accountId]: positions }));

        // Fetch options
        try {
          const optionsRes = await authenticatedGet(
            `http://localhost:3000/api/snaptrade/options/dbholdings?accountId=${encodeURIComponent(
              accountId
            )}`
          );
          const options = optionsRes?.data?.holdings || [];
          setAccountOptions((prev) => ({ ...prev, [accountId]: options }));
        } catch (optionsErr) {
          console.warn("Error fetching options:", optionsErr);
          setAccountOptions((prev) => ({ ...prev, [accountId]: [] }));
        }
      } catch (err) {
        console.error("Error fetching account details:", err);
        setAccountPositions((prev) => ({ ...prev, [accountId]: [] }));
        setAccountOptions((prev) => ({ ...prev, [accountId]: [] }));
      } finally {
        setLoadingPositions((prev) => ({ ...prev, [accountId]: false }));
      }
    };

    if (expandedAccountId) {
      fetchAccountDetails(expandedAccountId);
    }
  }, [expandedAccountId]);

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
        ) : accounts.length === 0 ? (
          <div className="portfolio-status">
            No accounts available. Connect a brokerage account to view your
            portfolio.
          </div>
        ) : (
          <div>
            {expandedAccountId ? (
              // Expanded account view
              (() => {
                const account = accounts.find(
                  (a) => a.accountId === expandedAccountId
                );
                if (!account) return null;

                // Extract currency string for fallback
                let fallbackCurrency = "USD";
                if (typeof account.currency === "string") {
                  fallbackCurrency = account.currency;
                } else if (account.currency?.code) {
                  fallbackCurrency = account.currency.code;
                }

                const balance = accountBalances[account.accountId] || {
                  totalValue: 0,
                  cashValue: 0,
                  positionsValue: 0,
                  optionsValue: 0,
                  currency: fallbackCurrency,
                };
                const positions = accountPositions[account.accountId] || [];
                const options = accountOptions[account.accountId] || [];
                const isLoading = loadingPositions[account.accountId];

                return (
                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedAccountId(null)}
                      style={{
                        marginBottom: "20px",
                        padding: "8px 16px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      ← Back to Accounts
                    </button>

                    <div className="account-card">
                      <div>
                        <div className="account-card-name">
                          {account.accountName || account.accountId}
                        </div>
                        <div className="account-card-id">
                          {account.accountId}
                        </div>
                        {account.institutionName && (
                          <div className="account-card-institution">
                            {account.institutionName}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="account-card-value">
                          {formatCurrency(balance.totalValue, balance.currency)}
                        </div>
                        <div className="account-card-breakdown">
                          {balance.positionsValue > 0 && (
                            <span>
                              Positions:{" "}
                              {formatCurrency(
                                balance.positionsValue,
                                balance.currency
                              )}
                            </span>
                          )}
                          {balance.cashValue > 0 && (
                            <span>
                              Cash:{" "}
                              {formatCurrency(
                                balance.cashValue,
                                balance.currency
                              )}
                            </span>
                          )}
                          {balance.optionsValue > 0 && (
                            <span>
                              Options:{" "}
                              {formatCurrency(
                                balance.optionsValue,
                                balance.currency
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isLoading ? (
                      <div className="portfolio-status">
                        Loading account details...
                      </div>
                    ) : (
                      <>
                        {options.length > 0 && (
                          <div style={{ marginTop: "24px" }}>
                            <h3>Options</h3>
                            <div className="portfolio-table-wrapper">
                              <table className="portfolio-table">
                                <thead>
                                  <tr>
                                    <th>Symbol</th>
                                    <th>Type</th>
                                    <th>Strike</th>
                                    <th>Exp</th>
                                    <th>Units</th>
                                    <th>Price</th>
                                    <th>Market Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {options.map((opt, idx) => {
                                    // Extract ticker - ensure it's a string
                                    let ticker = "";
                                    if (
                                      typeof opt?.symbol?.option_symbol
                                        ?.ticker === "string"
                                    ) {
                                      ticker = opt.symbol.option_symbol.ticker;
                                    } else if (
                                      typeof opt?.symbol?.option_symbol
                                        ?.underlying_symbol?.symbol === "string"
                                    ) {
                                      ticker =
                                        opt.symbol.option_symbol
                                          .underlying_symbol.symbol;
                                    } else if (
                                      typeof opt?.symbol?.option_symbol
                                        ?.ticker !== "undefined"
                                    ) {
                                      ticker = String(
                                        opt.symbol.option_symbol.ticker
                                      );
                                    }

                                    // Extract type - ensure it's a string
                                    let type = "";
                                    if (
                                      typeof opt?.symbol?.option_symbol
                                        ?.option_type === "string"
                                    ) {
                                      type =
                                        opt.symbol.option_symbol.option_type;
                                    } else if (
                                      typeof opt?.symbol?.option_symbol
                                        ?.option_type !== "undefined"
                                    ) {
                                      type = String(
                                        opt.symbol.option_symbol.option_type
                                      );
                                    }

                                    // Extract strike - ensure it's a number or null
                                    let strike = null;
                                    if (
                                      opt?.symbol?.option_symbol
                                        ?.strike_price != null
                                    ) {
                                      const strikeVal =
                                        opt.symbol.option_symbol.strike_price;
                                      strike =
                                        typeof strikeVal === "number"
                                          ? strikeVal
                                          : Number(strikeVal);
                                      if (isNaN(strike)) strike = null;
                                    }

                                    // Extract expiration - ensure it's a string
                                    let exp = "";
                                    if (
                                      typeof opt?.symbol?.option_symbol
                                        ?.expiration_date === "string"
                                    ) {
                                      exp =
                                        opt.symbol.option_symbol
                                          .expiration_date;
                                    } else if (
                                      opt?.symbol?.option_symbol
                                        ?.expiration_date != null
                                    ) {
                                      exp = String(
                                        opt.symbol.option_symbol.expiration_date
                                      );
                                    }

                                    const units = Number(opt?.units ?? 0);
                                    const price = opt?.price ?? null;
                                    const marketValue =
                                      price !== null ? price * units : null;

                                    // Extract currency string - handle both string and object cases
                                    let currencyStr = "USD";
                                    if (typeof opt?.currency === "string") {
                                      currencyStr = opt.currency;
                                    } else if (opt?.currency?.code) {
                                      currencyStr = opt.currency.code;
                                    } else if (
                                      typeof balance.currency === "string"
                                    ) {
                                      currencyStr = balance.currency;
                                    } else if (balance.currency?.code) {
                                      currencyStr = balance.currency.code;
                                    }

                                    // Ensure all string values are safe
                                    const safeTicker = String(ticker || "—");
                                    const safeType = String(type || "—");
                                    const safeExp = String(exp || "—");

                                    return (
                                      <tr key={`opt-${idx}-${safeTicker}`}>
                                        <td>{safeTicker}</td>
                                        <td>{safeType}</td>
                                        <td>
                                          {strike !== null
                                            ? String(strike)
                                            : "—"}
                                        </td>
                                        <td>{safeExp}</td>
                                        <td>{formatNumber(units)}</td>
                                        <td>
                                          {formatCurrency(price, currencyStr)}
                                        </td>
                                        <td>
                                          {marketValue !== null
                                            ? formatCurrency(
                                                marketValue,
                                                currencyStr
                                              )
                                            : "—"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {positions.length > 0 && (
                          <div style={{ marginTop: "24px" }}>
                            <h3>Positions</h3>
                            <div className="portfolio-table-wrapper">
                              <table className="portfolio-table">
                                <thead>
                                  <tr>
                                    <th>Symbol</th>
                                    <th>Name</th>
                                    <th>Units</th>
                                    <th>Price</th>
                                    <th>Market Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {positions.map((position, idx) => {
                                    const units = Number(
                                      position.units ?? position.lots ?? 0
                                    );
                                    const price = Number(position.price ?? 0);
                                    const marketValue = units * price;

                                    // Extract currency string - handle both string and object cases
                                    let currencyStr = "USD";
                                    if (typeof position.currency === "string") {
                                      currencyStr = position.currency;
                                    } else if (position.currency?.code) {
                                      currencyStr = position.currency.code;
                                    } else if (
                                      typeof balance.currency === "string"
                                    ) {
                                      currencyStr = balance.currency;
                                    } else if (balance.currency?.code) {
                                      currencyStr = balance.currency.code;
                                    }

                                    // Extract symbol string - handle nested structure: position.symbol.symbol.symbol
                                    // Based on SnapTrade API: symbol.symbol.symbol contains the actual ticker (e.g., "VAB.TO")
                                    let symbolStr = "—";
                                    if (typeof position.symbol === "string") {
                                      symbolStr = position.symbol;
                                    } else if (
                                      position.symbol &&
                                      typeof position.symbol === "object"
                                    ) {
                                      // Check nested structure: position.symbol.symbol.symbol (the actual ticker)
                                      if (
                                        position.symbol.symbol &&
                                        typeof position.symbol.symbol ===
                                          "object" &&
                                        typeof position.symbol.symbol.symbol ===
                                          "string" &&
                                        position.symbol.symbol.symbol
                                      ) {
                                        symbolStr =
                                          position.symbol.symbol.symbol;
                                      } else if (
                                        position.symbol.symbol &&
                                        typeof position.symbol.symbol ===
                                          "object" &&
                                        typeof position.symbol.symbol
                                          .raw_symbol === "string" &&
                                        position.symbol.symbol.raw_symbol
                                      ) {
                                        symbolStr =
                                          position.symbol.symbol.raw_symbol;
                                      } else if (
                                        typeof position.symbol.symbol ===
                                          "string" &&
                                        position.symbol.symbol
                                      ) {
                                        // Fallback: direct symbol.symbol as string
                                        symbolStr = position.symbol.symbol;
                                      } else if (
                                        typeof position.symbol.raw_symbol ===
                                          "string" &&
                                        position.symbol.raw_symbol
                                      ) {
                                        symbolStr = position.symbol.raw_symbol;
                                      }
                                      // Never use ID as it's a UUID, not the symbol name
                                    }

                                    // Extract name - check nested structure: position.symbol.symbol.description
                                    let nameStr = "—";
                                    // First check direct name field
                                    if (
                                      typeof position.name === "string" &&
                                      position.name
                                    ) {
                                      nameStr = position.name;
                                    } else if (
                                      position.symbol &&
                                      typeof position.symbol === "object"
                                    ) {
                                      // Check nested structure: position.symbol.symbol.description
                                      if (
                                        position.symbol.symbol &&
                                        typeof position.symbol.symbol ===
                                          "object" &&
                                        typeof position.symbol.symbol
                                          .description === "string" &&
                                        position.symbol.symbol.description
                                      ) {
                                        nameStr =
                                          position.symbol.symbol.description;
                                      } else if (
                                        position.symbol.symbol &&
                                        typeof position.symbol.symbol ===
                                          "object" &&
                                        typeof position.symbol.symbol.name ===
                                          "string" &&
                                        position.symbol.symbol.name
                                      ) {
                                        nameStr = position.symbol.symbol.name;
                                      } else if (
                                        typeof position.symbol.description ===
                                          "string" &&
                                        position.symbol.description
                                      ) {
                                        // Fallback: direct symbol.description
                                        nameStr = position.symbol.description;
                                      } else if (
                                        typeof position.symbol.name ===
                                          "string" &&
                                        position.symbol.name
                                      ) {
                                        nameStr = position.symbol.name;
                                      }
                                    }
                                    // If name is still empty, try position.name as object
                                    if (
                                      nameStr === "—" &&
                                      position.name &&
                                      typeof position.name === "object"
                                    ) {
                                      if (
                                        typeof position.name.name ===
                                          "string" &&
                                        position.name.name
                                      ) {
                                        nameStr = position.name.name;
                                      } else if (
                                        typeof position.name.description ===
                                          "string" &&
                                        position.name.description
                                      ) {
                                        nameStr = position.name.description;
                                      }
                                    }

                                    // Ensure all values are safe to render
                                    const safeSymbol = String(symbolStr || "—");
                                    const safeName = String(nameStr || "—");

                                    return (
                                      <tr
                                        key={`pos-${idx}-${safeSymbol || idx}`}
                                      >
                                        <td>{safeSymbol}</td>
                                        <td>{safeName}</td>
                                        <td>{formatNumber(units)}</td>
                                        <td>
                                          {formatCurrency(price, currencyStr)}
                                        </td>
                                        <td>
                                          {formatCurrency(
                                            marketValue,
                                            currencyStr
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {positions.length === 0 && options.length === 0 && (
                          <div
                            className="portfolio-status"
                            style={{ marginTop: "24px" }}
                          >
                            No positions or options found for this account.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()
            ) : (
              // Account cards list
              <div className="account-cards-container">
                {accounts.map((account) => {
                  // Extract currency string for fallback
                  let fallbackCurrency = "USD";
                  if (typeof account.currency === "string") {
                    fallbackCurrency = account.currency;
                  } else if (account.currency?.code) {
                    fallbackCurrency = account.currency.code;
                  }

                  const balance = accountBalances[account.accountId] || {
                    totalValue: 0,
                    cashValue: 0,
                    positionsValue: 0,
                    optionsValue: 0,
                    currency: fallbackCurrency,
                  };

                  return (
                    <button
                      key={account.accountId}
                      type="button"
                      className="account-card"
                      onClick={() => setExpandedAccountId(account.accountId)}
                    >
                      <div>
                        <div className="account-card-name">
                          {account.accountName || account.accountId}
                        </div>
                        <div className="account-card-id">
                          {account.accountId}
                        </div>
                        {account.institutionName && (
                          <div className="account-card-institution">
                            {account.institutionName}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="account-card-value">
                          {formatCurrency(balance.totalValue, balance.currency)}
                        </div>
                        <div className="account-card-breakdown">
                          {balance.positionsValue > 0 && (
                            <span>
                              Positions:{" "}
                              {formatCurrency(
                                balance.positionsValue,
                                balance.currency
                              )}
                            </span>
                          )}
                          {balance.cashValue > 0 && (
                            <span>
                              Cash:{" "}
                              {formatCurrency(
                                balance.cashValue,
                                balance.currency
                              )}
                            </span>
                          )}
                          {balance.optionsValue > 0 && (
                            <span>
                              Options:{" "}
                              {formatCurrency(
                                balance.optionsValue,
                                balance.currency
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Portfolio;

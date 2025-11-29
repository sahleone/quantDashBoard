import "./Positions.css";
import { useContext, useEffect, useState } from "react";
import UserContext from "../../context/Usercontext";
import { authenticatedGet } from "../../utils/apiClient";

function Positions() {
  const { userId } = useContext(UserContext) || {};
  const [positions, setPositions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPositions = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Rely on server-side authentication (cookies/JWT) to identify the
        // user via `req.user`. Do not attempt to send a GET body — browsers
        // may not include one. If you need to filter by account, send query
        // params instead (e.g. authenticatedGet(url, { params: { accountId } })).
        const resp = await authenticatedGet("/api/accounts/positions");
        const data = resp?.data ?? {};
        setPositions(Array.isArray(data.positions) ? data.positions : []);
      } catch (err) {
        console.error("Failed to load positions", err);
        setError(err?.response?.data || err?.message || "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPositions();
  }, [userId]);

  const formatCurrency = (v) => {
    if (v == null || Number.isNaN(Number(v))) return "—";
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(Number(v));
  };

  return (
    <div className="positions">
      <h1>Positions:</h1>

      {isLoading ? (
        <div>Loading positions…</div>
      ) : error ? (
        <div className="error">
          Error loading positions: {JSON.stringify(error)}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Quantity</th>
              <th>Entry Price</th>
              <th>Current Price</th>
              <th>Unrealized P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan={5}>No positions found</td>
              </tr>
            ) : (
              positions.map((p) => (
                <tr
                  key={`${p.accountId || "acct"}-${p.symbolTicker}-${
                    p._id || p.id || Math.random()
                  }`}
                >
                  <td>
                    {p.symbolTicker || p.positionSymbol?.symbol?.symbol || "—"}
                  </td>
                  <td>{p.units ?? p.quantity ?? "—"}</td>
                  <td>
                    {formatCurrency(
                      p.average_purchase_price ??
                        p.averagePurchasePrice ??
                        p.entryPrice
                    )}
                  </td>
                  <td>{formatCurrency(p.price ?? p.currentPrice)}</td>
                  <td>
                    {formatCurrency(p.open_pnl ?? p.openPnl ?? p.unrealizedPnl)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Positions;

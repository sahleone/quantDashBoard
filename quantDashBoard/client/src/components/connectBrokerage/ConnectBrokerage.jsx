import { useState, useEffect, useContext, useRef, useCallback } from "react";
import "./ConnectBrokerage.css";
import UserContext from "../../context/UserContext";
import { authenticatedGet, authenticatedPost } from "../../utils/apiClient";


function ConnectBrokerage() {
  const { userId } = useContext(UserContext);

  const [connections, setConnections] = useState([]);
  const [connectionsSummary, setConnectionsSummary] = useState(null);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountsSummary, setAccountsSummary] = useState(null);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState(null);

  // small helper to reduce duplication between connections/accounts fetchers
  const fetchResource = useCallback(
    async ({ path, itemsKey, setItems, setSummary, setLoading, setError }) => {
      if (!userId) return;

      try {
        setLoading(true);
        setError(null);

        // Use relative paths so the client works against whichever host is serving the API
        const response = await authenticatedGet(path);
        const data = response?.data || {};
        setItems(data[itemsKey] || []);
        setSummary(data.summary || null);
      } catch (error) {
        console.error(`Error fetching ${itemsKey}:`, error);
        setError(`Unable to load ${itemsKey} right now.`);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  const fetchConnections = useCallback(() => {
    return fetchResource({
      path: "/api/connections",
      itemsKey: "connections",
      setItems: setConnections,
      setSummary: setConnectionsSummary,
      setLoading: setConnectionsLoading,
      setError: setConnectionsError,
    });
  }, [fetchResource]);

  const fetchAccounts = useCallback(() => {
    return fetchResource({
      path: "/api/accounts",
      itemsKey: "accounts",
      setItems: setAccounts,
      setSummary: setAccountsSummary,
      setLoading: setAccountsLoading,
      setError: setAccountsError,
    });
  }, [fetchResource]);

  useEffect(() => {
    if (userId) {
      fetchAccounts();
      fetchConnections();
    }
  }, [userId, fetchAccounts, fetchConnections]);

  // dropdown state for the add connection button (basic native select)
  const [selectedBroker, setSelectedBroker] = useState("ROBINHOOD");

  // list of brokers used to render the custom menu
  const BROKERS = [
    { value: "ROBINHOOD", label: "Robinhood" },
    { value: "ETRADE", label: "Etrade" },
    { value: "MORGAN_STANLEY", label: "Morgan Stanley" },
    { value: "WEBULL", label: "Webull" },
    { value: "COINBASE", label: "Coinbase" },
    { value: "FIDELITY", label: "Fidelity" },
    { value: "KRAKEN", label: "Kraken" },
    { value: "AJ-BELL", label: "AJ Bell" },
    { value: "ALPACA", label: "Alpaca" },
    { value: "ALPACA-PAPER", label: "Alpaca (Paper)" },
    { value: "BINANCE", label: "Binance" },
    { value: "BUX", label: "BUX" },
    { value: "CHASE", label: "Chase" },
    { value: "COMMSEC", label: "CommSec" },
    { value: "DEGIRO", label: "DeGiro" },
    { value: "EMPOWER", label: "Empower" },
    { value: "INTERACTIVE-BROKERS-FLEX", label: "Interactive Brokers (Flex)" },
    { value: "MOOMOO", label: "Moomoo" },
    { value: "PUBLIC", label: "Public" },
    { value: "QUESTRADE", label: "Questrade" },
    { value: "SCHWAB", label: "Schwab" },
    { value: "STAKEAUS", label: "Stake (AU)" },
    { value: "TASTYTRADE", label: "Tastytrade" },
    { value: "TD-DIRECT-INVESTING", label: "TD Direct Investing" },
    { value: "TRADESTATION", label: "TradeStation" },
    { value: "TRADESTATION-SIM", label: "TradeStation (Sim)" },
    { value: "TRADIER", label: "Tradier" },
    { value: "TRADING212", label: "Trading212" },
    { value: "TRADING212-PRACTICE", label: "Trading212 (Practice)" },
    { value: "UPSTOX", label: "Upstox" },
    { value: "VANGUARD", label: "Vanguard" },
    { value: "WEALTHSIMPLETRADE", label: "Wealthsimple Trade" },
    { value: "WEBULL-CANADA", label: "Webull (Canada)" },
    { value: "WELLS-FARGO", label: "Wells Fargo" },
    { value: "ZERODHA", label: "Zerodha" },
  ];

  // (basic) no extra click handlers — native select used below

  const handleAddConnection = async (e) => {
    e.preventDefault(); // stop form reload

    try {
      const broker = selectedBroker;

      const response = await authenticatedPost(
        "/api/connections/snaptrade/portal",
        {
          broker: broker,
        }
      );

      if (response.data.redirectUrl) {
        window.open(response.data.redirectUrl, "_blank");
      } else {
        alert("No redirect URL returned from server.");
      }

      // keep the special flag used elsewhere in the app when a portal is opened
      window.snaptradeConnectionsBefore = -1;

      await fetchAccounts();
      await fetchConnections();
    } catch (error) {
      console.error("Error adding connection:", error);
    }
  };

  // Full sync state (source data + metrics pipeline)
  const [fullSyncLoading, setFullSyncLoading] = useState(false);
  const [fullSyncMessage, setFullSyncMessage] = useState(null);
  const [fullSyncError, setFullSyncError] = useState(null);

  const handleFullSync = async () => {
    setFullSyncLoading(true);
    setFullSyncMessage(null);
    setFullSyncError(null);

    try {
      const response = await authenticatedPost("/api/accounts/sync/full", {
        fullSync: false,
      });
      const data = response.data || {};
      setFullSyncMessage(
        `Sync complete — ${data.accounts ?? 0} accounts, ${data.holdings ?? 0} holdings updated, metrics recalculated`
      );
      // Refresh lists to reflect new data
      await fetchAccounts();
      await fetchConnections();
      setTimeout(() => setFullSyncMessage(null), 6000);
    } catch (err) {
      console.error("Full sync failed:", err);
      setFullSyncError(
        err?.response?.data?.error?.message || err.message || "Full sync failed"
      );
    } finally {
      setFullSyncLoading(false);
    }
  };

  return (
    <div className="connect-brokerage">
      <h2>Brokerage Accounts</h2>

      <div className="form-and-refresh">
        <div className="form-section">
          <form onSubmit={handleAddConnection}>
            <h3>Add Connection</h3>
            <label htmlFor="broker">Broker</label>
            <br />
            <select
              id="broker"
              name="broker"
              value={selectedBroker}
              onChange={(e) => setSelectedBroker(e.target.value)}
              size={8}
            >
              {BROKERS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
            <br />
            <br />
            <button type="submit">Add Connection</button>
          </form>
        </div>

        {/* Right column: full sync button */}
        <div className="refresh-wrapper">
          <div className="full-sync-wrap">
            <button
              type="button"
              className="full-sync-button"
              onClick={handleFullSync}
              disabled={fullSyncLoading}
              aria-busy={fullSyncLoading}
            >
              {fullSyncLoading ? "Updating..." : "Update All Data"}
            </button>
            <p className="full-sync-hint">
              Syncs accounts, holdings, prices, and recalculates all metrics
            </p>
            {fullSyncMessage && (
              <div className="full-sync-success">{fullSyncMessage}</div>
            )}
            {fullSyncError && (
              <div className="full-sync-error">Error: {fullSyncError}</div>
            )}
          </div>
        </div>
      </div>

      <div className="connections-list">
        <h4>
          Connections ({connections.length})
          {connectionsSummary?.source === "snaptrade" ? " · synced" : ""}
        </h4>
        {connectionsLoading ? (
          <p style={{ color: "gray", fontStyle: "italic" }}>
            Loading your connections...
          </p>
        ) : connectionsError ? (
          <p style={{ color: "red" }}>{connectionsError}</p>
        ) : connections.length === 0 ? (
          <p style={{ color: "gray", fontStyle: "italic" }}>
            No connections found yet. Any existing SnapTrade connections will
            appear here automatically.
          </p>
        ) : (
          connections.map((connection) => (
            <div key={connection.connectionId} className="connection-item">
              <p>
                <strong>Brokerage:</strong> {connection.brokerageName}
              </p>
              <p>
                <strong>Status:</strong> {connection.status}
              </p>
              <p>
                <strong>Last Synced:</strong>{" "}
                {connection.lastSyncDate
                  ? new Date(connection.lastSyncDate).toLocaleString()
                  : "N/A"}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="accounts-list">
        <h4>
          Accounts ({accounts.length})
          {accountsSummary?.source === "snaptrade" ? " · synced" : ""}
        </h4>
        {accountsLoading ? (
          <p style={{ color: "gray", fontStyle: "italic" }}>
            Loading your accounts...
          </p>
        ) : accountsError ? (
          <p style={{ color: "red" }}>{accountsError}</p>
        ) : accounts.length === 0 ? (
          <p style={{ color: "gray", fontStyle: "italic" }}>
            No accounts found. Connect a brokerage account to see your accounts
            here.
          </p>
        ) : (
          accounts.map((account) => {
            const institution =
              account.institutionName || account.brokerageName || "Unknown";
            const statusLabel = account.status
              ? account.status.toUpperCase()
              : "UNKNOWN";

            return (
              <div key={account.accountId} className="account-item">
                <p>
                  <strong>Account Name:</strong> {account.accountName}
                </p>
                <p>
                  <strong>Institution:</strong> {institution}
                </p>
                <p>
                  <strong>Currency:</strong> {account.currency || "USD"}
                </p>
                {account.balance?.total?.amount != null && (
                  <p>
                    <strong>Balance:</strong> {account.balance.total.amount}{" "}
                    {account.balance.total.currency || account.currency || ""}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ConnectBrokerage;

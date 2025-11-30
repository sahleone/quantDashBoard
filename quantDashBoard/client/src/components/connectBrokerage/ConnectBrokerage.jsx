import { useState, useEffect, useContext, useRef, useCallback } from "react";
import "./ConnectBrokerage.css";
import UserContext from "../../context/UserContext";
import { authenticatedGet, authenticatedPost } from "../../utils/apiClient";
import RefreshButton from "../refreshButton/refreshButton";

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

  // Refresh button will call the refresh endpoint and then re-fetch lists

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

        {/* Right column: refresh button */}
        <div className="refresh-wrapper">
          <RefreshButton
            onSuccess={async () => {
              await fetchAccounts();
              await fetchConnections();
            }}
          />
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

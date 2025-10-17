import { useState, useEffect, useContext, useRef, useCallback } from "react";
import "./ConnectBrokerage.css";
import UserContext from "../context/Usercontext";
import { authenticatedGet, authenticatedPost } from "../utils/apiClient";

function ConnectBrokerage() {
  const { user } = useContext(UserContext);
  const userId = user?.userId;

  const [connections, setConnections] = useState([]);
  const [connectionsSummary, setConnectionsSummary] = useState(null);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountsSummary, setAccountsSummary] = useState(null);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState(null);

  const fetchConnections = useCallback(async () => {
    if (!userId) {
      return;
    }

    try {
      setConnectionsLoading(true);
      setConnectionsError(null);

      const response = await authenticatedGet(
        "http://localhost:3000/api/connections"
      );

      const fetchedConnections = response.data?.connections || [];
      setConnections(fetchedConnections);
      setConnectionsSummary(response.data?.summary || null);
    } catch (error) {
      console.error("Error fetching connections:", error);
      setConnectionsError("Unable to load connections right now.");
    } finally {
      setConnectionsLoading(false);
    }
  }, [userId]);

  const fetchAccounts = useCallback(async () => {
    if (!userId) {
      return;
    }

    try {
      setAccountsLoading(true);
      setAccountsError(null);

      const response = await authenticatedGet(
        "http://localhost:3000/api/accounts"
      );

      console.log("Accounts response:", response.data);
      setAccounts(response.data?.accounts || []);
      setAccountsSummary(response.data?.summary || null);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      setAccountsError("Unable to load accounts right now.");
    } finally {
      setAccountsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchAccounts();
      fetchConnections();
    }
  }, [userId, fetchAccounts, fetchConnections]);

  // for the add connection button
  const brokerToAddRef = useRef("");
  const handleAddConnection = async (e) => {
    e.preventDefault(); // stop form reload

    try {
      const broker = brokerToAddRef.current.value;

      const response = await authenticatedPost(
        "http://localhost:3000/api/connections/snaptrade/portal",
        {
          broker: broker,
        }
      );

      if (response.data.redirectUrl) {
        window.open(response.data.redirectUrl, "_blank");
      } else {
        alert("No redirect URL returned from server.");
      }

      console.log("Connection created:", response.data);

      // Set flag to start polling for new connections
      window.snaptradeConnectionsBefore = -1; // Special flag to indicate portal was opened
      // Do not attempt to POST connections/accounts here; the server stores
      // the connection during the exchange step, and `Settings.jsx` will
      // poll and trigger the holdings sync. We can optionally refresh the
      // local accounts list once, but full data appears after sync.
      await fetchAccounts();
      await fetchConnections();
    } catch (error) {
      console.error("Error adding connection:", error);
    }
  };

  // for the refresh button
  const handleRefresh = async () => {
    console.log("Refresh");

    try {
      // refresh the accounts
      const response = await authenticatedPost(
        "http://localhost:3000/api/accounts/sync/holdings",
        {}
      );
      console.log("Accounts refreshed:", response.data);

      // Refresh accounts list
      await fetchAccounts();
      await fetchConnections();
    } catch (err) {
      console.error("Error refreshing accounts:", err);
    }
  };

  return (
    <div className="connect-brokerage">
      <h2>Brokerage Accounts</h2>

      <div className="form-section">
        <form onSubmit={handleAddConnection}>
          <h3>Add Connection</h3>
          <label htmlFor="broker">Broker</label>
          <br />
          <select id="broker" name="broker" ref={brokerToAddRef}>
            <option value="ROBINHOOD">Robinhood</option>
            <option value="ETRADE">Etrade</option>
            <option value="MORGAN_STANLEY">Morgan Stanley</option>
          </select>
          <br />
          <br />
          <button type="submit">Add Connection</button>
        </form>
      </div>
      {/* brokerToAddRef can be empty before mount; avoid logging undefined */}
      <br />
      <button onClick={handleRefresh}>Refresh</button>

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
                  <strong>Status:</strong> {statusLabel}
                </p>
                <p>
                  <strong>Currency:</strong> {account.currency || "USD"}
                </p>
                {account.balance?.total?.amount != null && (
                  <p>
                    <strong>Balance:</strong> {account.balance.total.amount}
                    {" "}
                    {account.balance.total.currency ||
                      account.currency ||
                      ""}
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

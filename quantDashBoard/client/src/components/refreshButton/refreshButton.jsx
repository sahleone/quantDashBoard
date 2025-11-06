import { useState, useContext } from "react";
import "./refreshButton.css";
import { authenticatedPost } from "../../utils/apiClient";
import UserContext from "../../context/Usercontext";

/**
 * RefreshButton
 * Calls POST /api/accounts/refresh and provides simple UI feedback.
 * Props:
 *  - className: additional CSS class for the button
 *  - onSuccess: callback(response) when refresh succeeds
 *  - onError: callback(error) when refresh fails
 */
function RefreshButton({ className = "", onSuccess, onError, children }) {
  const { userId } = useContext(UserContext);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      // Send userId when available; server also accepts JWT via cookie/headers
      const body = userId ? { userId } : {};
      // Refresh accounts and connections in parallel. We keep the same accounts
      // endpoint for backwards compatibility and also refresh connections.
      const [accountsResp, connectionsResp, holdingsResp] = await Promise.all([
        authenticatedPost("/api/accounts/refresh", body),
        authenticatedPost("/api/connections/refresh", body),
        // New endpoint: update holdings for all accounts across connections
        authenticatedPost("/api/accounts/sync/holdings/connections", {
          ...body,
          fullSync: false,
        }),
      ]);

      setMessage("Data refreshed");
      if (onSuccess)
        onSuccess({
          accounts: accountsResp,
          connections: connectionsResp,
          holdings: holdingsResp,
        });

      // Clear message after short delay
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error("Refresh failed:", err);
      setError(err?.response?.data || { message: err.message || String(err) });
      if (onError) onError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`qd-refresh-button-wrap ${className}`.trim()}>
      <button
        type="button"
        className="qd-refresh-button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? "Refreshing…" : children || "Refresh Accounts"}
      </button>

      {message && <div className="qd-refresh-success">{message}</div>}
      {error && (
        <div className="qd-refresh-error">
          Error: {error.message || JSON.stringify(error)}
        </div>
      )}
    </div>
  );
}

// PropTypes removed - component does not perform runtime prop validation.

export default RefreshButton;

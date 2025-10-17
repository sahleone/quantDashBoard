import "./Settings.css";
import { useReducer, useEffect, useContext } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Profile from "../components/Profile";
import Preferences from "../components/Preferences";
import Connections from "../components/Connections";
import {
  authenticatedGet,
  authenticatedPost,
  isAuthenticated,
} from "../utils/apiClient";
import UserContext from "../context/Usercontext";

// Helper function to make authenticated requests using the API client
const makeAuthenticatedRequest = async (url, options = {}) => {
  console.log("Making authenticated request to:", url);
  console.log("Request timestamp:", new Date().toISOString());

  if (options.method === "POST") {
    return authenticatedPost(url, options.data || {}, options);
  } else {
    return authenticatedGet(url, options);
  }
};

function Settings() {
  const [activeTab, setActiveTab] = useReducer(
    (prev, next) => next,
    "connections"
  );
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useContext(UserContext);

  // Reset connection polling marker on mount/unmount
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.snaptradeConnectionsBefore = undefined;
    }

    return () => {
      if (typeof window !== "undefined") {
        window.snaptradeConnectionsBefore = undefined;
      }
    };
  }, []);

  // Show loading or redirect if not authenticated
  if (!isAuthenticated() || !user.userId) {
    return (
      <div className="settings">
        <div className="settings-container">
          <h1>Settings</h1>
          <p>Please log in to access your settings.</p>
          <button onClick={() => navigate("/login")}>Go to Login</button>
        </div>
      </div>
    );
  }

  // Poll for new connections after portal completion
  useEffect(() => {
    // Only start polling if user is authenticated
    if (!isAuthenticated() || !user.userId) {
      return;
    }

    let pollInterval;
    let timeout;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    const pollForConnections = async () => {
      if (window.snaptradeConnectionsBefore === undefined) return;

      // If portal was just opened, get current connection count
      if (window.snaptradeConnectionsBefore === -1) {
        try {
          const response = await makeAuthenticatedRequest(
            "http://localhost:3000/api/connections"
          );
          const currentConnections = response.data.connections || [];
          window.snaptradeConnectionsBefore = currentConnections.length;
          console.log(
            "Portal opened, current connections:",
            currentConnections.length
          );
          consecutiveErrors = 0; // Reset error counter on success
        } catch (error) {
          console.error("Error getting initial connection count:", error);
          consecutiveErrors++;
          if (consecutiveErrors >= maxConsecutiveErrors) {
            console.log("Too many consecutive errors, stopping polling");
            clearInterval(pollInterval);
            clearTimeout(timeout);
          }
          return;
        }
      }

      try {
        const response = await makeAuthenticatedRequest(
          "http://localhost:3000/api/connections"
        );

        const currentConnections = response.data.connections || [];
        console.log("Current connections:", currentConnections.length);
        console.log("Before connections:", window.snaptradeConnectionsBefore);

        // Reset error counter on successful request
        consecutiveErrors = 0;

        // Check if new connection was created
        if (currentConnections.length > window.snaptradeConnectionsBefore) {
          console.log("New connection detected! Populating databases...");

          // Get the new connection (last one)
          const newConnection =
            currentConnections[currentConnections.length - 1];
          console.log("New connection:", newConnection);

          // Populate all databases with new connection data
          try {
          const syncResponse = await makeAuthenticatedRequest(
            "http://localhost:3000/api/accounts/sync/holdings",
            {
              method: "POST",
              data: {
                connectionId:
                  newConnection.connectionId || newConnection.authorizationId,
                fullSync: true,
              },
            }
          );

            console.log("Database population completed:", syncResponse.data);
            alert("Connection established and data synced successfully!");

            // Clear the polling flag and stop polling
            window.snaptradeConnectionsBefore = undefined;
            clearInterval(pollInterval);
            clearTimeout(timeout);
          } catch (syncError) {
            console.error("Error populating databases:", syncError);
            alert(
              "Connection established but failed to sync data. Please try refreshing."
            );
            // Stop polling on sync error
            clearInterval(pollInterval);
            clearTimeout(timeout);
          }
        }
      } catch (error) {
        console.error("Error polling connections:", error);
        console.error("Error response:", error.response?.data);
        console.error("Error status:", error.response?.status);
        console.error("Error headers:", error.response?.headers);

        consecutiveErrors++;

        // Stop polling if we get too many consecutive errors (likely auth issues)
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.log("Too many consecutive errors, stopping polling");
          clearInterval(pollInterval);
          clearTimeout(timeout);
        }
      }
    };

    // Poll every 3 seconds for up to 2 minutes
    pollInterval = setInterval(pollForConnections, 3000);

    // Stop polling after 2 minutes
    timeout = setTimeout(() => {
      clearInterval(pollInterval);
      console.log("Stopped polling for connections");
    }, 120000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [user.userId]);

  // Handle SnapTrade callback (legacy - keeping for compatibility)
  useEffect(() => {
    const handleSnapTradeCallback = async () => {
      // Check if user is authenticated before handling callback
      if (!isAuthenticated() || !user.userId) {
        console.log("User not authenticated, cannot handle SnapTrade callback");
        return;
      }

      // Check for various possible callback parameters
      const authorizationId =
        searchParams.get("authorizationId") ||
        searchParams.get("authorization_id") ||
        searchParams.get("authId") ||
        searchParams.get("token");

      const sessionId =
        searchParams.get("sessionId") ||
        searchParams.get("session_id") ||
        searchParams.get("session");

      // Log all URL parameters for debugging
      console.log(
        "All URL parameters:",
        Object.fromEntries(searchParams.entries())
      );
      console.log("Current URL:", window.location.href);

      if (authorizationId) {
        console.log("SnapTrade callback detected:", {
          authorizationId,
          sessionId,
        });

        try {
          // Exchange authorization for connection details
          const response = await makeAuthenticatedRequest(
            "http://localhost:3000/api/connections/snaptrade/exchange",
            {
              method: "POST",
              data: {
                authorizationId: authorizationId,
                sessionId: sessionId,
              },
            }
          );

          console.log("Connection exchange successful:", response.data);

          // Sync accounts data after successful connection
          try {
            const syncResponse = await makeAuthenticatedRequest(
              "http://localhost:3000/api/accounts/sync/holdings",
              {
                method: "POST",
                data: {},
              }
            );
            console.log("Accounts synced successfully:", syncResponse.data);
          } catch (syncError) {
            console.error("Error syncing accounts:", syncError);
            // Don't show error to user as connection was successful
          }

          // Clear URL parameters
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          // Show success message
          alert("Connection established successfully!");
        } catch (error) {
          console.error("Error exchanging authorization:", error);
          alert("Failed to establish connection. Please try again.");
        }
      } else {
        // Log that no callback parameters were found
        console.log("No SnapTrade callback parameters detected");
      }
    };

    handleSnapTradeCallback();
  }, [searchParams, user.userId]);

  const renderContent = () => {
    switch (activeTab) {
      case "profile":
        return <Profile />;
      case "preferences":
        return <Preferences />;
      case "connections":
        return <Connections />;
      default:
        return <Profile />;
    }
  };

  const isActive = (tab) => {
    return activeTab === tab ? "active" : "";
  };

  return (
    <div className="settings">
      <div className="settings-container">
        <h1>Settings</h1>
        <ul>
          <li>
            <button
              className={`settings-btn ${isActive("profile")}`}
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </button>
          </li>
          <li>
            <button
              className={`settings-btn ${isActive("preferences")}`}
              onClick={() => setActiveTab("preferences")}
            >
              Preferences
            </button>
          </li>
          <li>
            <button
              className={`settings-btn ${isActive("connections")}`}
              onClick={() => setActiveTab("connections")}
            >
              Connections
            </button>
          </li>
        </ul>
      </div>
      <section className="settings-content">{renderContent()}</section>
    </div>
  );
}

export default Settings;

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authenticatedPost } from "../../utils/apiClient";
import { clearAuth } from "../../utils/authInterceptor";

function Logout() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const doLogout = async () => {
      try {
        const response = await authenticatedPost("/api/auth/logout");
        console.log(response);
      } catch (error) {
        console.log("Logout request failed:", error);
      } finally {
        // Clear local auth state (no navigation) and then navigate client-side
        clearAuth();
        if (!cancelled) navigate("/");
      }
    };

    doLogout();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Nothing to render while performing logout; component navigates when done.
  return null;
}

export default Logout;

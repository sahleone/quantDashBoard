import { NavLink, Outlet } from "react-router-dom";
import { useContext } from "react";
import UserContext from "../context/UserContext";

function RootLayout() {
  const context = useContext(UserContext) || {};
  const { userId } = context;

  const isAuthenticated = !!userId;

  return (
    <div className="root-layout">
      <header>
        <nav>
          <h1>Quant Dashboard</h1>

          {/* Protected links: show only when authenticated */}
          {isAuthenticated && (
            <>
              <NavLink to="/portfolio">Portfolio</NavLink>
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/settings">Settings</NavLink>
              <NavLink to="/stock-info">Stock Info</NavLink>
            </>
          )}

          {/* Auth links: show Logout when authenticated, otherwise show Login/Signup */}
          {isAuthenticated ? <NavLink to="/logout">Logout</NavLink> : null}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default RootLayout;

import { NavLink, Outlet } from "react-router-dom";
import { useContext } from "react";
import UserContext from "../context/UserContext";

function RootLayout() {
  const context = useContext(UserContext) || {};
  const { userId } = context;

  const isAuthenticated = !!userId;

  return (
    <div className="root-layout">
      {isAuthenticated && (
        <header>
          <nav>
            <h1>Quant Dashboard</h1>

            {/* Protected links: show only when authenticated */}
            <NavLink to="/portfolio">Portfolio</NavLink>
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/asset-allocation">Asset Allocation</NavLink>
            <NavLink to="/dividends">Dividends</NavLink>
            <NavLink to="/settings">Settings</NavLink>
            <NavLink to="/stock-info">Stock Info</NavLink>
            <NavLink to="/logout">Logout</NavLink>
          </nav>
        </header>
      )}
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default RootLayout;

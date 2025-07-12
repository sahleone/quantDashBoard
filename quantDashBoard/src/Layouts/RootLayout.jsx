import { NavLink, Outlet } from "react-router-dom";

function RootLayout() {
  return (
    <div className="root-layout">
      <header>
        <nav>
          <h1>Quant Dashboard</h1>

          <NavLink to="/">Home</NavLink>
          <NavLink to="/portfolio">Portfolio</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default RootLayout;

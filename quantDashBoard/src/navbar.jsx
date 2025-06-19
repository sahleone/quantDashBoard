import React from "react";
import "./navbar.css"; 
function Nav() {
  return (
    <div className="navbar">
      <div className="navbar_logo">
        <p>DashBoard</p>
      </div>

      <div className="navbar_links">
        {/* separate into component that returns different links if user is
            logged in or not */}
        <ul>
          <li>
            <a href="/dashboard">Dashboard</a>
          </li>
          <li>
            <a href="/portfolio">Portfolio</a>
          </li>
          <li>
            <a href="/settings">Settings</a>
          </li>
        </ul>
        {/* if user is not logged in, show login and signup links */}
      </div>
    </div>
  );
}

export default Nav;

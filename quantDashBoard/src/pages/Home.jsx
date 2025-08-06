import "./Home.css";
import QuantDashLogo from "../assets/QuantDash.png";

function Home() {
  return (
    <div className="home">
      <div className="home-branding">
        {/* Placeholder logo, replace src with your actual logo path */}
        <img
          src={QuantDashLogo}
          alt="Quant Dashboard Logo"
          className="home-logo"
        />
        <h1 className="home-tagline">
          Quant Dash: Smarter Portfolio Insights
        </h1>
      </div>
      <p className="home-description">
        Your all-in-one workspace for analyzing portfolios, visualizing
        performance, and gaining actionable financial insights.
      </p>
      <div className="home-actions">
        <button className="home-login-btn">Log In</button>
        <button className="home-signup-btn">Sign Up</button>
      </div>

      <div className="home-note">
        <strong>New?</strong> Start by connecting your brokerage account in the
        Dashboard to pull in your real portfolio data.
      </div>
    </div>
  );
}

export default Home;

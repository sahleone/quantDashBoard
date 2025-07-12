import "./Home.css";

function Home() {
  return (
    <div className="home">
      <h1 className="home-title">Welcome to Quant Dashboard!</h1>
      <p className="home-description">
        Your all-in-one workspace for analyzing portfolios, visualizing
        performance, and gaining actionable financial insights.
      </p>

      <div className="home-note">
        <strong>New?</strong> Start by connecting your brokerage account in the
        Dashboard to pull in your real portfolio data.
      </div>
    </div>
  );
}

export default Home;

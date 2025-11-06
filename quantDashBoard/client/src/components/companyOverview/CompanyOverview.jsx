import "./CompanyOverview.css";

function CompanyOverview({ tickerOverviewData }) {
  if (!tickerOverviewData) {
    return null;
  }

  // Extract data from tickerOverviewData
  const results = tickerOverviewData.results || {};
  const branding = results.branding || {};
  const logoUrl = branding.logo_url || "N/A";
  const companyName = results.name;
  const description = results.description;
  const cik = results.cik;
  const marketCap = results.market_cap;
  const homepageUrl = results.homepage_url;
  const totalEmployees = results.total_employees;
  const listDate = results.list_date;
  const shareClassSharesOutstanding = results.share_class_shares_outstanding;

  return (
    <div className="ticker-overview">
      <h2>Company Overview</h2>
      <div className="overview-grid">
        <div className="overview-item">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Company Logo"
              style={{ width: "50px", height: "50px" }}
            />
          ) : (
            "N/A"
          )}
        </div>
        <div className="overview-item">
          <strong>Name:</strong> {companyName}
        </div>
        <div className="overview-item">
          <strong>Description:</strong> {description}
        </div>
        <div className="overview-item">
          <strong>CIK:</strong> {cik}
        </div>
        <div className="overview-item">
          <strong>Market Cap:</strong> {marketCap}
        </div>
        <div className="overview-item">
          <strong>Homepage:</strong>{" "}
          {homepageUrl ? 
          (
            <a href={homepageUrl} target="_blank">
              {homepageUrl}
            </a>
          ) : ("N/A")}
        </div>
        <div className="overview-item">
          <strong>Total Employees:</strong> {totalEmployees}
        </div>
        <div className="overview-item">
          <strong>List Date:</strong> {listDate}
        </div>
        <div className="overview-item">
          <strong>Share Class Shares Outstanding:</strong>{" "}
          {shareClassSharesOutstanding}
        </div>
      </div>
    </div>
  );
}

export default CompanyOverview;

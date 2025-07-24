function Portfolio() {
  return (
    <div className="portfolio">
      <div className="portfolio-writeup">
        <h1>Portfolio</h1>
        <p>
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Illo repellat
          delectus impedit vitae, alias et quisquam amet quod eius reiciendis
          fugiat iure beatae, a quae soluta, repudiandae aperiam maxime corporis?
        </p>
      </div>
        < div className="portfolio-content">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>AAPL</td>
              <td>Apple Inc.</td>
              <td>100</td>
            </tr>
            <tr>
              <td>MSFT</td>
              <td>Microsoft Corporation</td>
              <td>200</td>
            </tr>
            <tr>
              <td>GOOG</td>
              <td>Alphabet Inc.</td>
              <td>300</td>
            </tr>
          </tbody>
        </table>



      </div>
    </div>
  );
}

export default Portfolio;

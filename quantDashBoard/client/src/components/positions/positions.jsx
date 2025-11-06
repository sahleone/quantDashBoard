import "./Positions.css";

function Positions() {


  return (
    <div className="positions">
      <h1>Positions:</h1>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Quantity</th>
            <th>Entry Price</th>
            <th>Current Price</th>
            <th>Unrealized P&L</th>
          </tr>
        </thead>
        <tbody>   
          <tr>
            <td>AAPL</td>
            <td>10</td>   
            <td>$150.00</td>
            <td>$155.00</td>
            <td>$50.00</td>
          </tr>
        </tbody>
        </table>

    </div>
  );
}

export default Positions;

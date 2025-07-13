import "./LineGraph.css";

import { Line } from "react-chartjs-2";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
  } from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
  );

function LineGraph({ticker, labels, data}) {
    const options = {}

    const chartData = {
        labels: labels,
        datasets: [
            {
                label: ticker,
                data: data,
                borderColor: "rgb(75, 192, 192)",
            }
        ]
    }

    return(
        <div className="line-graph">
            <h2>{ticker}</h2>
            <div className="line-graph-container">
                <Line data={chartData} options={options} />
            </div>
        </div>


    )
}

export default LineGraph;
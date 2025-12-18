import fs from "fs";
import { ensureDbConnection, getDb } from "../test/utils/dbConnection.js";

const DATABASE_URL = process.env.DATABASE_URL || "mongodb+srv://rhysjervis2:RgRYOx97CgzHdemQ@cluster0.3vrnf.mongodb.net/node_auth";

async function compareResults() {
  console.log("=".repeat(60));
  console.log("PYTHON vs JAVASCRIPT PIPELINE COMPARISON");
  console.log("=".repeat(60));

  // Read Python CSV output if it exists
  let pythonResults = null;
  try {
    const csvContent = fs.readFileSync("./portfolio_python.csv", "utf-8");
    const lines = csvContent.trim().split("\n");
    const headers = lines[0].split(",");
    const lastLine = lines[lines.length - 1];
    const values = lastLine.split(",");
    
    pythonResults = {};
    headers.forEach((h, i) => {
      pythonResults[h.trim()] = parseFloat(values[i]) || values[i].trim();
    });
    
    // Get date from first column
    pythonResults.date = values[0].trim();
    pythonResults.total_rows = lines.length - 1; // Exclude header
  } catch (err) {
    console.log("⚠️  Python CSV not found, skipping Python results");
  }

  // Get JavaScript results from MongoDB
  let jsResults = null;
  try {
    await ensureDbConnection(DATABASE_URL);
    const db = getDb();
    const portfolioCollection = db.collection("portfoliotimeseries");
    
    // Get the latest entry
    const latest = await portfolioCollection
      .find({})
      .sort({ date: -1 })
      .limit(1)
      .toArray();
    
    if (latest.length > 0) {
      jsResults = latest[0];
    }
    
    // Get total count
    const totalCount = await portfolioCollection.countDocuments({});
    if (jsResults) {
      jsResults.total_rows = totalCount;
    }
  } catch (err) {
    console.log("⚠️  Could not fetch JavaScript results:", err.message);
  }

  console.log("\n📊 PYTHON RESULTS:");
  if (pythonResults) {
    console.log(`  Date: ${pythonResults.date}`);
    console.log(`  Total Rows: ${pythonResults.total_rows}`);
    console.log(`  Cash Value: $${pythonResults.cash_value?.toFixed(2) || "N/A"}`);
    console.log(`  Stock Value: $${pythonResults.stock_value?.toFixed(2) || "N/A"}`);
    console.log(`  Total Value: $${(parseFloat(pythonResults.cash_value || 0) + parseFloat(pythonResults.stock_value || 0)).toFixed(2)}`);
    console.log(`  Simple Returns: ${pythonResults.simple_returns?.toFixed(6) || "N/A"}`);
    console.log(`  Cum Return: ${pythonResults.cum_return?.toFixed(6) || "N/A"}`);
    console.log(`  Equity Index: ${pythonResults.equity_index?.toFixed(6) || "N/A"}`);
  } else {
    console.log("  No data available");
  }

  console.log("\n📊 JAVASCRIPT RESULTS:");
  if (jsResults) {
    console.log(`  Date: ${jsResults.date}`);
    console.log(`  Total Rows: ${jsResults.total_rows}`);
    console.log(`  Cash Value: $${jsResults.cashValue?.toFixed(2) || "N/A"}`);
    console.log(`  Stock Value: $${jsResults.stockValue?.toFixed(2) || "N/A"}`);
    console.log(`  Total Value: $${jsResults.totalValue?.toFixed(2) || "N/A"}`);
    console.log(`  Simple Returns: ${jsResults.simpleReturns?.toFixed(6) || "N/A"}`);
    console.log(`  Cum Return: ${jsResults.cumReturn?.toFixed(6) || "N/A"}`);
    console.log(`  Equity Index: ${jsResults.equityIndex?.toFixed(6) || "N/A"}`);
  } else {
    console.log("  No data available");
  }

  console.log("\n🔍 COMPARISON:");
  if (pythonResults && jsResults) {
    const pyTotal = parseFloat(pythonResults.cash_value || 0) + parseFloat(pythonResults.stock_value || 0);
    const jsTotal = parseFloat(jsResults.totalValue || 0);
    
    console.log(`  Total Value Difference: $${(pyTotal - jsTotal).toFixed(2)}`);
    console.log(`  Cash Value Difference: $${(parseFloat(pythonResults.cash_value || 0) - parseFloat(jsResults.cashValue || 0)).toFixed(2)}`);
    console.log(`  Stock Value Difference: $${(parseFloat(pythonResults.stock_value || 0) - parseFloat(jsResults.stockValue || 0)).toFixed(2)}`);
    
    if (pythonResults.simple_returns && jsResults.simpleReturns) {
      const retDiff = parseFloat(pythonResults.simple_returns) - parseFloat(jsResults.simpleReturns);
      console.log(`  Simple Returns Difference: ${retDiff.toFixed(6)}`);
    }
    
    if (pythonResults.cum_return && jsResults.cumReturn) {
      const cumDiff = parseFloat(pythonResults.cum_return) - parseFloat(jsResults.cumReturn);
      console.log(`  Cum Return Difference: ${cumDiff.toFixed(6)}`);
    }
  }

  console.log("\n" + "=".repeat(60));
}

compareResults().catch(console.error);


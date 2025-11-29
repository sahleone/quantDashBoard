import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { requireAuth, checkUser } from "./middleware/authmiddleware.js";
import { config } from "./config/environment.js";

// routes
import apiRoutes from "./routes/api.js";
dotenv.config();

const FrontendPort = config.server.FrontendPort;
const BackendPort = config.server.BackendPort;
const app = express();

// middleware
app.use(
  cors({
    origin: `http://localhost:${FrontendPort}`,
    credentials: true, // Allow cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allowed methods
  })
);

app.use(express.json());
app.use(cookieParser());

// Connect to MongoDB
// NOTE: mongoose v6+ and the Node MongoDB driver v4+ ignore
// `useNewUrlParser` and `useUnifiedTopology` options — passing
// them triggers deprecation warnings. Call connect with the
// connection string only (or with current valid options) to
// avoid the warning.
mongoose
  .connect(config.DATABASE_URL)
  .then(() => {
    console.log("Successfully connected to MongoDB.");
    app.listen(BackendPort, () => {
      console.log(`Server is running on port ${BackendPort}`);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error.message);
    console.error(
      "Please make sure MongoDB is running and DATABASE_URL is set correctly in your .env file"
    );
    process.exit(1);
  });

// API routes - all routes are now under /api
app.use("/api", apiRoutes);

app.get("/", (req, res) => {
  res.send("Hello, World!\n The server is running!\n woohoo!");
});

// 404 error handler
app.use((req, res) => {
  res.status(404).send("Sorry, that route does not exist.");
});

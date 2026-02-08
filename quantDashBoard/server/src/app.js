import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { requireAuth, checkUser } from "./middleware/authMiddleware.js";
import { config } from "./config/environment.js";
import apiRoutes from "./routes/api.js";
dotenv.config();

const FrontendPort = config.server.FrontendPort;
const BackendPort = config.server.BackendPort;
const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || `http://localhost:${FrontendPort}`,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());
app.use(cookieParser());

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

app.use("/api", apiRoutes);

app.get("/", (req, res) => {
  res.send("Hello, World!\n The server is running!\n woohoo!");
});

app.use((req, res) => {
  res.status(404).send("Sorry, that route does not exist.");
});

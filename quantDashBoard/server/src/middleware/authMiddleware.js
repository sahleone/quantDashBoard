import jwt from "jsonwebtoken";
import User from "../models/Users.js";
import { config } from "../config/environment.js";

const requireAuth = (req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : req.cookies.jwt;

  if (token) {
    jwt.verify(token, config.jwt.secret, async (err, decodedToken) => {
      if (err) {
        // Log details for debugging
        console.log("JWT verification failed:", err.message);
        console.log(
          "Token that failed:",
          token ? token.substring(0, 60) + "..." : token
        );

        // In development return a bit more context to help debugging clients
        if (process.env.NODE_ENV !== "production") {
          return res.status(401).json({
            message: "Unauthorized",
            error: err.message,
            tokenPreview: token ? token.substring(0, 60) + "..." : null,
          });
        }

        // In production, do not expose verification details
        return res.status(401).json({ message: "Unauthorized" });
      } else {
        try {
          console.log("JWT decoded successfully, user ID:", decodedToken.id);
          const user = await User.findById(decodedToken.id);
          if (user) {
            console.log("User found in database:", user.userId);
            req.user = user;
            next();
          } else {
            console.log("User not found in database for ID:", decodedToken.id);
            res.status(401).json({ message: "User not found" });
          }
        } catch (dbError) {
          console.log("Database error:", dbError.message);
          res.status(500).json({ message: "Database error" });
        }
      }
    });
  } else {
    console.log("No token provided");
    res.status(401).json({ message: "Unauthorized" });
  }
};

// check if user is logged in
const checkUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : req.cookies.jwt;

  if (token) {
    jwt.verify(token, config.jwt.secret, async (err, decodedToken) => {
      if (err) {
        res.locals.user = null;
        return res.status(401).json({ message: "Unauthorized" });
      } else {
        const user = await User.findById(decodedToken.id);
        res.locals.user = user;
        req.user = user;
        next();
      }
    });
  } else {
    res.locals.user = null;
    next();
  }
};

export { requireAuth, checkUser };

import React, { useState, useEffect } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";
import axios from "axios";
import "./App.css";

// context
import UserContext from "./context/UserContext";

// utils
import { setupAuthInterceptors } from "./utils/authInterceptor";
import { authenticatedGet } from "./utils/apiClient";

// pages
import Dashboard from "./pages/Dashboard";
import Home from "./pages/home/Home.jsx";
import Settings from "./pages/settings/Settings";
import Portfolio from "./pages/portfolio/Portfolio";
import StockInfo from "./pages/stockInfo/StockInfo";
import AssetAllocation from "./pages/assetAllocation/AssetAllocation";
import Dividends from "./pages/dividends/Dividends";
import NotFound from "./pages/notFound/NotFound.jsx";

import Logout from "./components/auth/Logout";
import ProtectedRoutes from "./utils/ProtectedRoutes.jsx";

// layouts
import RootLayout from "./Layouts/RootLayout";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<RootLayout />}>
      <Route index element={<Home />} />
      <Route element={<ProtectedRoutes />}>
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="asset-allocation" element={<AssetAllocation />} />
        <Route path="dividends" element={<Dividends />} />
        <Route path="settings" element={<Settings />} />
        <Route path="stock-info" element={<StockInfo />} />
        <Route path="logout" element={<Logout />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Route>
  )
);

function App() {
  // Ensure axios sends cookies on cross-site requests by default. This
  // avoids missing cookies on requests that forget to set withCredentials.
  axios.defaults.withCredentials = true;
  // Store a richer `user` object in context (id, secret, name, email, ...)
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Setup authentication interceptors on app start
  useEffect(() => {
    setupAuthInterceptors();
  }, []);

  // Check if user is already logged in on app start
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // We'll ask the API for the current user using credentials (cookies).
        // We no longer rely on any token in localStorage.
        const response = await authenticatedGet("/api/user/me");

        // Expect the server to return either { user: { ... } } or user fields at top
        const dataUser = response?.data?.user ?? response?.data ?? null;

        if (dataUser) {
          // Normalize common field names
          const normalized = {
            ...dataUser,
            userId: dataUser.userId ?? dataUser.id ?? dataUser.userid ?? null,
            userSecret:
              dataUser.userSecret ??
              dataUser.secret ??
              dataUser.secretKey ??
              null,
          };
          setUser(normalized);
          console.log("User is authenticated:", normalized);
        } else {
          console.log("No user info returned from /api/user/me");
        }
      } catch (error) {
        console.log("User not authenticated", error?.message ?? error);
        // Keep context values null when not authenticated
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (isLoading) return <div>Loading...</div>;

  // Helper setters to partially update the user object
  const setUserId = (id) => {
    setUser((prev) => ({ ...(prev || {}), userId: id }));
  };

  const setUserSecret = (secret) => {
    setUser((prev) => ({ ...(prev || {}), userSecret: secret }));
  };

  return (
    <UserContext.Provider
      value={{
        user,
        setUser,
        userId: user?.userId ?? null,
        userSecret: user?.userSecret ?? null,
        setUserId,
        setUserSecret,
      }}
    >
      <div className="app">
        <RouterProvider router={router} />
      </div>
    </UserContext.Provider>
  );
}

export default App;

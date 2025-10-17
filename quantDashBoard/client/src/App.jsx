import { React, useState, useEffect } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";
import axios from "axios";

// context
import UserContext from "./context/Usercontext";

// utils
import { setupAuthInterceptors } from "./utils/authInterceptor";

// pages
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Portfolio from "./pages/Portfolio";
import StockInfo from "./pages/StockInfo";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Logout from "./components/Logout";

// layouts
import RootLayout from "./Layouts/RootLayout";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<RootLayout />}>
      <Route index element={<Home />} />
      <Route path="portfolio" element={<Portfolio />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="settings" element={<Settings />} />
      <Route path="stock-info" element={<StockInfo />} />
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<Signup />} />
      <Route path="logout" element={<Logout />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  )
);

function App() {
  const [user, setUser] = useState({ userId: null });
  const [isLoading, setIsLoading] = useState(true);

  // Setup authentication interceptors on app start
  useEffect(() => {
    setupAuthInterceptors();
  }, []);

  // Check if user is already logged in on app start
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Get access token from localStorage
        const accessToken = localStorage.getItem("accessToken");

        if (!accessToken) {
          console.log("No access token found");
          setIsLoading(false);
          return;
        }

        // Try to get current user info with token
        const response = await axios.get("http://localhost:3000/api/user/me", {
          withCredentials: true,
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        // If we get here, the user is authenticated
        setUser(response.data.user);
        console.log("User is authenticated:", response.data.user);
      } catch (error) {
        console.log("User not authenticated");
        // Clear invalid token
        localStorage.removeItem("accessToken");
        // User is not logged in, keep userId as null
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <div className="app">
        <RouterProvider router={router} />
      </div>
    </UserContext.Provider>
  );
}

export default App;

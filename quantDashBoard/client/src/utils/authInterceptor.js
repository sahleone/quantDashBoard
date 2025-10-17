/**
 * Authentication Interceptor
 *
 * Handles automatic token refresh when access tokens expire.
 * Intercepts axios requests and responses to manage authentication seamlessly.
 *
 * @file authInterceptor.js
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2025
 */

import axios from "axios";

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

// Create axios instance for token refresh
const refreshAxios = axios.create({
  baseURL: "http://localhost:3000",
  withCredentials: true,
});

/**
 * Refresh access token using refresh token
 */
const refreshToken = async () => {
  try {
    // Prefer sending refresh token explicitly from storage to avoid
    // cross-site cookie delivery issues during local dev.
    const storedRefresh = localStorage.getItem("refreshToken");
    const response = await refreshAxios.post("/api/auth/refresh", {
      refreshToken: storedRefresh,
    });
    const newAccessToken = response.data.accessToken;

    // Update localStorage with new token
    localStorage.setItem("accessToken", newAccessToken);

    return newAccessToken;
  } catch (error) {
    console.error("Token refresh failed:", error);

    // Clear invalid tokens and redirect to login
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    window.location.href = "/login";

    throw error;
  }
};

/**
 * Setup axios interceptors for automatic token refresh
 */
export const setupAuthInterceptors = () => {
  console.log("Setting up auth interceptors...");

  // Request interceptor - add auth header to requests that don't already have one
  axios.interceptors.request.use(
    (config) => {
      // List of public endpoints that don't require authentication
      const publicEndpoints = [
        "/api/auth/signup",
        "/api/auth/login",
        "/api/auth/refresh",
      ];

      // Check if this is a public endpoint
      const isPublicEndpoint = publicEndpoints.some(
        (endpoint) => config.url && config.url.includes(endpoint)
      );

      // Only add token if not already present, if we have one, and if it's not a public endpoint
      if (!config.headers.Authorization && !isPublicEndpoint) {
        const token = localStorage.getItem("accessToken");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          console.log("Auth interceptor: Added token to request", config.url);
        } else {
          console.log(
            "Auth interceptor: No token found for request",
            config.url
          );
        }
      } else if (isPublicEndpoint) {
        console.log(
          "Auth interceptor: Skipping token for public endpoint",
          config.url
        );
      } else {
        console.log(
          "Auth interceptor: Token already present for request",
          config.url
        );
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor - handle token refresh on 401 errors
  axios.interceptors.response.use(
    (response) => {
      return response;
    },
    async (error) => {
      const originalRequest = error.config;

      // Only handle 401 errors for authenticated endpoints
      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          // If already refreshing, queue this request
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return axios(originalRequest);
            })
            .catch((err) => {
              return Promise.reject(err);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const newToken = await refreshToken();
          processQueue(null, newToken);

          // Retry the original request with new token
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return axios(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    }
  );
};

/**
 * Clear authentication data
 */
export const clearAuth = () => {
  localStorage.removeItem("accessToken");
  // Clear any pending refresh attempts
  processQueue(new Error("User logged out"), null);
};

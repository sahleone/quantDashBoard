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

// Resolve API base from Vite env when available so the refresh call targets
// the same backend the rest of the client uses.
const API_BASE =
  (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) ||
  "http://localhost:3000";
const refreshAxios = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

const refreshToken = async () => {
  try {
    // Server should manage refresh token via httpOnly cookie. We simply
    // call the refresh endpoint with credentials and let the server set
    // any new cookies. If the server returns a new access token in the
    // body, we return it; otherwise return null to indicate cookies are used.
    const response = await refreshAxios.post("/api/auth/refresh");

    const newAccessToken = response?.data?.accessToken ?? null;

    // Note: when using httpOnly cookies you typically don't need to store
    // the token client-side. The server will set the cookie. Return any
    // token the server includes for backwards compatibility.
    return newAccessToken;
  } catch (error) {
    console.error("Token refresh failed:", error);

    // Do NOT perform a hard redirect here; let the app decide how to handle
    // refresh failure (e.g. show a login modal or navigate via router). A
    // hard redirect to "/login" caused navigation to the Vite dev server
    // origin (http://localhost:5173/login) during development.

    throw error;
  }
};

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

      // For cookie-based auth we don't add an Authorization header here.
      // If a token header is already present, keep it. Public endpoints are
      // allowed through without modification.
      if (isPublicEndpoint) {
        console.log(
          "Auth interceptor: Skipping token for public endpoint",
          config.url
        );
      } else {
        console.log(
          "Auth interceptor: Proceeding (cookies will be sent)",
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
              // If refresh returned a token, attach it. Otherwise retry and
              // rely on cookies being sent by the browser.
              if (token) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
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

          // Retry the original request. If server returned a token, add it
          // to the header; otherwise rely on cookies.
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
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
  // When using cookie-based auth there is no client-side token to remove.
  // Clear any pending refresh attempts and redirect to login.
  processQueue(new Error("User logged out"), null);
  // Do not navigate here. Components should call clearAuth() and then
  // perform navigation with the router (useNavigate) so the SPA navigation
  // occurs without a full page reload and uses the correct route origin.
};

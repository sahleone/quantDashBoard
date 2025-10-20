/**
 * API Client Utility
 *
 * Provides authenticated axios requests with automatic token handling
 * and error management for the QuantDashboard application.
 *
 * @file apiClient.js
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2025
 */

import axios from "axios";

// Base URL for backend API. Use Vite env variable when available, fall back to localhost.
const API_BASE =
  (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) ||
  "http://localhost:3000";

/**
 * Create an authenticated axios request configuration
 * @param {string} url - The API endpoint URL
 * @param {object} options - Additional axios options
 * @returns {object} Axios configuration with authentication headers
 */
export const createAuthenticatedRequest = (url, options = {}) => {
  const token = localStorage.getItem("accessToken");

  if (!token) {
    throw new Error("No access token found. Please log in.");
  }

  // If a relative path is provided (starts with '/'), prefix with API_BASE
  const fullUrl =
    typeof url === "string" && url.startsWith("/") ? `${API_BASE}${url}` : url;

  return {
    url: fullUrl,
    withCredentials: true,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
    ...options,
  };
};

/**
 * Make an authenticated GET request
 * @param {string} url - The API endpoint URL
 * @param {object} options - Additional axios options
 * @returns {Promise} Axios response promise
 */
export const authenticatedGet = async (url, options = {}) => {
  const config = createAuthenticatedRequest(url, options);
  return axios.get(config.url, config);
};

/**
 * Make an authenticated POST request
 * @param {string} url - The API endpoint URL
 * @param {object} data - Request body data
 * @param {object} options - Additional axios options
 * @returns {Promise} Axios response promise
 */
export const authenticatedPost = async (url, data = {}, options = {}) => {
  const config = createAuthenticatedRequest(url, { ...options, data });
  return axios.post(config.url, config.data, config);
};

/**
 * Make an authenticated PUT request
 * @param {string} url - The API endpoint URL
 * @param {object} data - Request body data
 * @param {object} options - Additional axios options
 * @returns {Promise} Axios response promise
 */
export const authenticatedPut = async (url, data = {}, options = {}) => {
  const config = createAuthenticatedRequest(url, { ...options, data });
  return axios.put(config.url, config.data, config);
};

/**
 * Make an authenticated DELETE request
 * @param {string} url - The API endpoint URL
 * @param {object} options - Additional axios options
 * @returns {Promise} Axios response promise
 */
export const authenticatedDelete = async (url, options = {}) => {
  const config = createAuthenticatedRequest(url, options);
  return axios.delete(config.url, config);
};

/**
 * Check if user is authenticated by verifying token exists
 * @returns {boolean} True if token exists, false otherwise
 */
export const isAuthenticated = () => {
  const token = localStorage.getItem("accessToken");
  return !!token;
};

/**
 * Get the current access token
 * @returns {string|null} The access token or null if not found
 */
export const getAccessToken = () => {
  return localStorage.getItem("accessToken");
};

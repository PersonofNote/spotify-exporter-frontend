// JWT token management utilities

const TOKEN_KEY = 'spotify_jwt_token';

export const tokenManager = {
  // Store JWT token in localStorage
  setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
  },

  // Get JWT token from localStorage
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  // Remove JWT token from localStorage
  removeToken() {
    localStorage.removeItem(TOKEN_KEY);
  },

  // Check if user has a valid token
  hasToken() {
    const token = this.getToken();
    if (!token) return false;
    
    // Basic check if token is expired (decode JWT payload)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      return payload.exp > now;
    } catch (error) {
      console.error('Error checking token validity:', error);
      return false;
    }
  },

  // Get user ID from token
  getUserId() {
    const token = this.getToken();
    if (!token) return null;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.user_id;
    } catch (error) {
      console.error('Error extracting user ID from token:', error);
      return null;
    }
  },

  // Get token expiration time
  getTokenExpiration() {
    const token = this.getToken();
    if (!token) return null;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return new Date(payload.exp * 1000);
    } catch (error) {
      console.error('Error extracting expiration from token:', error);
      return null;
    }
  }
};

// Axios interceptor to add JWT token to requests
export const setupAxiosInterceptors = (axiosInstance) => {
  // Request interceptor to add Authorization header
  axiosInstance.interceptors.request.use(
    (config) => {
      const token = tokenManager.getToken();
      if (token && tokenManager.hasToken()) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor to handle token expiration
  axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        // Token expired or invalid, remove it
        tokenManager.removeToken();
        // Optionally trigger re-authentication
        window.dispatchEvent(new CustomEvent('auth-expired'));
      }
      return Promise.reject(error);
    }
  );
};
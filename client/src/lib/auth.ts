// Mock authentication for development environment
// In production, this would integrate with Azure AD

export interface User {
  id: string;
  name: string;
  email: string;
  preferred_username?: string;
  oid?: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
}

// Mock user for development
export const mockUser: User = {
  id: "mock-user-id",
  name: "Admin User",
  email: "admin@example.com",
  preferred_username: "admin@example.com",
  oid: "mock-user-id"
};

export const getAuthToken = (): string | null => {
  // Check for Google JWT token first, then Azure token
  // Tokens stored in sessionStorage for security (prevents XSS token theft)
  // sessionStorage is cleared when browser tab closes
  return sessionStorage.getItem("google_jwt_token") || sessionStorage.getItem("azure_token");
};

export const isTokenExpired = (token: string): boolean => {
  try {
    // In development, always return false
    if (import.meta.env.DEV) {
      return false;
    }
    
    // In production, check actual token expiry
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
};

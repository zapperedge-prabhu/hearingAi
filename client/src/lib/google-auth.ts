// Google Authentication Service
interface GoogleAuthResponse {
  authUrl: string;
}

interface GoogleUser {
  email: string;
  name: string;
  provider: string;
}

interface GoogleLoginResponse {
  success: boolean;
  session_id: string;
  message: string;
  user: GoogleUser;
}

export async function getGoogleAuthUrl(): Promise<string> {
  const response = await fetch('/api/auth/google/url');
  if (!response.ok) {
    throw new Error('Failed to get Google auth URL');
  }
  const data: GoogleAuthResponse = await response.json();
  return data.authUrl;
}

export async function authenticateWithGoogle(code: string, state?: string): Promise<GoogleLoginResponse> {
  const response = await fetch('/api/auth/google/callback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ code, state }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Google authentication failed' }));
    throw new Error(errorData.error || 'Google authentication failed');
  }

  const result = await response.json();
  
  // Store JWT token for API security (matching Microsoft approach)
  if (result.token) {
    sessionStorage.setItem('google_jwt_token', result.token);
    console.log('Google JWT token stored for secure API calls');
  }

  return result;
}

export async function initGoogleLogin(): Promise<void> {
  try {
    const authUrl = await getGoogleAuthUrl();
    // Redirect to Google OAuth instead of popup
    window.location.href = authUrl;
  } catch (error) {
    throw new Error('Failed to initiate Google authentication');
  }
}
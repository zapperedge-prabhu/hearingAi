import { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
import { OAuth2Client } from 'google-auth-library';
import { storage } from "./storage";

// Google OAuth configuration
// Get the current domain for redirect URI
const getRedirectUri = () => {
  const domain = process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
  const protocol = domain.includes('replit.dev') ? 'https' : 'http';
  const redirectUri = `${protocol}://${domain}/api/auth/google/callback`;
  console.log(`Google OAuth redirect URI: ${redirectUri}`);
  return redirectUri;
};

const googleClient = new OAuth2Client(
  process.env.ZAPPER_GOOGLE_CLIENT_ID,
  process.env.ZAPPER_GOOGLE_CLIENT_SECRET,
  getRedirectUri()
);

// Google user interface
interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}

// Generate Google OAuth URL with state protection
export function getGoogleAuthUrl(req: any): string {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  // 🧾 Add state parameter for CSRF protection
  const state = crypto.randomBytes(32).toString('hex');
  req.session.googleState = state;

  return googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    include_granted_scopes: true,
    state: state
  });
}

// Verify Google OAuth token
export async function verifyGoogleToken(code: string): Promise<GoogleUser> {
  try {
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.ZAPPER_GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid Google token payload');
    }

    return {
      id: payload.sub,
      email: payload.email!,
      name: payload.name!,
      picture: payload.picture,
      email_verified: payload.email_verified || false
    };
  } catch (error) {
    console.error('Google token verification failed:', error);
    throw new Error('Google authentication failed');
  }
}

// Google authentication middleware
export async function authenticateGoogleUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, state } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Google authorization code required' });
    }

    // 🧾 Verify state parameter for CSRF protection
    const expectedState = (req as any).session.googleState;
    if (!expectedState || state !== expectedState) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    
    // Clear state after verification
    delete (req as any).session.googleState;

    // Verify Google token and get user info
    const googleUser = await verifyGoogleToken(code);
    
    if (!googleUser.email_verified) {
      return res.status(400).json({ error: 'Google email not verified' });
    }

    // Check if user exists in database (same security as Microsoft)
    const user = await storage.getUserByEmail(googleUser.email);
    
    // Reject access if user doesn't exist (matching Microsoft security)
    if (!user) {
      return res.status(403).json({ 
        error: 'Access denied. Your email address is not registered in the system. Please contact your administrator to request access.',
        code: 'USER_NOT_REGISTERED'
      });
    }

    // Check if user is enabled
    if (!user.isEnabled) {
      return res.status(403).json({ 
        error: 'User account is disabled. Please contact your administrator.',
        code: 'USER_DISABLED'
      });
    }

    // Check if user has at least one enabled organization role
    const enabledOrgs = await storage.getUserOrganizationIds(googleUser.email.toLowerCase().trim());
    if (enabledOrgs.length === 0) {
      return res.status(403).json({ 
        error: 'Access denied',
        code: 'NO_ACTIVE_ROLES'
      });
    }

    // Generate JWT token for API security (matching Microsoft approach)
    const jwtPayload = {
      oid: user.id.toString(),
      email: user.email,
      name: user.name,
      preferred_username: user.email,
      provider: 'google'
    };
    
    const jwtSecret = process.env. ZAPPER_JWT_SECRET!; // Safe because we validate in index.ts
    const token = jwt.sign(jwtPayload, jwtSecret, { expiresIn: '24h' });

    // Store user info in session
    const session = (req as any).session;
    session.user = {
      id: user.id.toString(),
      email: user.email,
      name: user.name,
      provider: 'google',
      token: token  // Store token in session for frontend access
    };

    // Also attach to request for immediate use
    req.user = {
      id: user.id.toString(),
      oid: googleUser.id,
      email: user.email,
      name: user.name,
      provider: 'google',
      token: token
    };
    
    // Also populate dbUser for consistent access to database fields (matches Microsoft flow)
    (req as any).dbUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      isEnabled: user.isEnabled,
      organizationId: enabledOrgs[0], // Use first enabled org (same pattern as Microsoft flow)
      roles: [] // Roles would be loaded separately if needed
    };
    // OPTIONAL: prefer HttpOnly cookie over sessionStorage to reduce XSS exposure.
    // res.cookie("zapper_google_jwt", token, {
    //   httpOnly: true,
    //   sameSite: "lax",
    //   secure: process.env.NODE_ENV === "production",
    //   maxAge: 1000 * 60 * 60 * 12 // 12h
    // });

    next();
  } catch (error) {
    console.error('Google authentication error:', error);
    res.status(401).json({ error: 'Google authentication failed' });
  }
}

// Get Google user profile
export async function getGoogleUserProfile(accessToken: string): Promise<any> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Google user profile');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching Google user profile:', error);
    throw error;
  }
}

// Middleware to check if Google SSO is enabled
export function googleSSOEnabled(req: Request, res: Response, next: NextFunction) {
  const ssoFeature = parseInt(process.env.ZAPPER_SSO_FEATURE || '1');
  
  // ZAPPER_SSO_FEATURE: 1=Microsoft only, 2=Google only, 3=Both
  if (ssoFeature === 1) {
    return res.status(403).json({ error: 'Google SSO is not enabled' });
  }
  
  next();
}
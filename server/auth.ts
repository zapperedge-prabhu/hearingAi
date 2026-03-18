import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { authenticateGoogleUser, googleSSOEnabled } from "./auth-google";

// Azure AD configuration
const TENANT_ID = process.env.ZAPPER_AZURE_TENANT_ID ;
const CLIENT_ID = process.env.ZAPPER_AZURE_CLIENT_ID ;
const ACCEPT_GRAPH_AUD = (process.env.ZAPPER_ACCEPT_GRAPH_AUDIENCE || "true").toLowerCase() === "true";

// JWKS configuration with timeout control to prevent hanging
const jwksUri = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;
const JWKS_TIMEOUT_MS = 2000; // 2 second timeout to prevent hanging
const JWKS_MAX_RETRIES = 2; // Maximum retry attempts

// Create JWKS client with fetch wrapper that includes timeout
const createJwksWithTimeout = () => {
  return createRemoteJWKSet(new URL(jwksUri), {
    cooldownDuration: 30000,  // 30 seconds cooldown between key refetches
    cacheMaxAge: 600000,      // 10 minutes cache duration
  });
};

const azureJwks = createJwksWithTimeout();

// Cache verified token claims by token string (until exp)
const tokenCache = new Map<string, { exp: number; claims: any }>();

// Performance metrics for monitoring
let jwksMetrics = {
  totalCalls: 0,
  cacheHits: 0,
  jwksSuccesses: 0,
  jwksFailures: 0,
  graphApiFallbacks: 0,
  avgLatency: 0,
};

function isGuidUpn(upn?: string): boolean {
  if (!upn) return false;
  const [name] = upn.split("@");
  // crude GUID check: 8-4-4-4-12 hex groups
  return /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/.test(name);
}

// Helper function to verify JWT with timeout using Promise.race
async function verifyJwtWithTimeout(token: string, retries = 0): Promise<any> {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('JWKS verification timeout')), JWKS_TIMEOUT_MS);
  });

  const verifyPromise = jwtVerify(token, azureJwks, {
    issuer: [
      `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      `https://sts.windows.net/${TENANT_ID}/`
    ],
  });

  try {
    const result = await Promise.race([verifyPromise, timeoutPromise]);
    return result;
  } catch (error: any) {
    // Retry logic for transient failures
    if (retries < JWKS_MAX_RETRIES && (error.message === 'JWKS verification timeout' || error.code === 'ETIMEDOUT')) {
      console.log(`⚠️ [JWKS] Timeout/network error, retrying (${retries + 1}/${JWKS_MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, 200 * (retries + 1))); // Exponential backoff
      return verifyJwtWithTimeout(token, retries + 1);
    }
    throw error;
  }
}

// Azure JWT verification with JWKS - now with timeout protection
async function verifyAzureJwtLocally(token: string): Promise<any> {
  const startTime = Date.now();
  jwksMetrics.totalCalls++;

  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && cached.exp * 1000 > Date.now()) {
    jwksMetrics.cacheHits++;
    console.log(`✅ [JWKS] Cache hit - verification in ${Date.now() - startTime}ms`);
    return cached.claims;
  }

  try {
    // Verify JWT with timeout protection and retry logic
    const { payload } = await verifyJwtWithTimeout(token);

    // Audience check
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    const graphAud = "00000003-0000-0000-c000-000000000000"; // Microsoft Graph
    const audOk = (aud === CLIENT_ID) || (ACCEPT_GRAPH_AUD && aud === graphAud);
    if (!audOk) {
      throw Object.assign(new Error("Invalid audience"), { status: 401 });
    }

    // Shape to app's user format
    const email =
      (payload as any).email ||
      (payload as any).preferred_username ||
      (payload as any).upn;

    // Derive display name: prefer 'name' claim, fallback to given_name + family_name, then email
    let displayName = (payload as any).name;
    if (!displayName || displayName.toLowerCase() === 'unknown') {
      const givenName = (payload as any).given_name;
      const familyName = (payload as any).family_name;
      if (givenName && familyName) {
        displayName = `${givenName} ${familyName}`;
      } else if (givenName) {
        displayName = givenName;
      } else if (familyName) {
        displayName = familyName;
      } else {
        displayName = email;
      }
    }
    const user = {
      email,
      name: displayName,
      oid: (payload as any).oid || (payload as any).sub || email,
      preferred_username: email,
      friendlyEmail: isGuidUpn(email) ? undefined : email,
    };

    // Cache until expiry
    const exp = (payload.exp as number) || Math.floor(Date.now() / 1000) + 300;
    tokenCache.set(token, { exp, claims: user });

    const latency = Date.now() - startTime;
    jwksMetrics.jwksSuccesses++;
    jwksMetrics.avgLatency = (jwksMetrics.avgLatency * (jwksMetrics.totalCalls - 1) + latency) / jwksMetrics.totalCalls;
    console.log(`✅ [JWKS] Local verification successful in ${latency}ms`);

    return user;
  } catch (error: any) {
    jwksMetrics.jwksFailures++;
    const latency = Date.now() - startTime;
    console.error(`❌ [JWKS] Local verification failed in ${latency}ms:`, error.message);
    throw error;
  }
}

// SSO Helper functions
export function getSSOConfig() {
  // Read SSO_FEATURE dynamically to pick up runtime changes
  const SSO_FEATURE = parseInt(process.env.ZAPPER_SSO_FEATURE || '1');
  
  console.log(`SSO_FEATURE from env: ${process.env.ZAPPER_SSO_FEATURE}, parsed: ${SSO_FEATURE}`);
  
  return {
    ssoFeature: SSO_FEATURE,
    supportsMicrosoft: SSO_FEATURE === 1 || SSO_FEATURE === 3,
    supportsGoogle: SSO_FEATURE === 2 || SSO_FEATURE === 3,
    supportsBoth: SSO_FEATURE === 3
  };
}

export function microsoftSSOEnabled(req: Request, res: Response, next: NextFunction) {
  const config = getSSOConfig();
  if (!config.supportsMicrosoft) {
    return res.status(403).json({ error: 'Microsoft SSO is not enabled' });
  }
  next();
}

// Enhanced JWT verification with local Azure validation
export async function verifyToken(token: string): Promise<any> {
  // First try to verify as Google JWT token (our internal tokens)
  try {
    const jwt = require('jsonwebtoken');
    const jwtSecret = process.env.ZAPPER_JWT_SECRET!; // Safe because we validate in index.ts
    
    const decoded = jwt.verify(token, jwtSecret);
    if (decoded && decoded.provider === 'google') {
      console.log('✅ [TOKEN VERIFY] Google JWT token verified');
      return decoded;
    }
  } catch (googleError: any) {
    // Distinguish expiry for better UX
    if (googleError?.name === 'TokenExpiredError') {
      const err = new Error("Google token expired");
      (err as any).status = 401;
      throw err;
    }
    console.log('🔍 [TOKEN VERIFY] Not a Google JWT token (or invalid), trying Microsoft...');
  }
  
  // Try local JWKS validation first (fast, 5-20ms cached)
  try {
    console.log('🔍 [TOKEN VERIFY] Attempting Microsoft JWKS validation...');
    return await verifyAzureJwtLocally(token);
  } catch (jwksError: any) {
    // SECURITY: Only fallback to Graph API for timeout/network errors, NOT validation errors
    // Validation errors (401 status, invalid audience, signature, etc.) should fail immediately
    const isValidationError = jwksError.status === 401 || 
                              jwksError.message?.includes('Invalid audience') ||
                              jwksError.message?.includes('signature') ||
                              jwksError.message?.includes('expired') ||
                              jwksError.message?.includes('invalid');
    
    const isNetworkError = jwksError.message === 'JWKS verification timeout' ||
                          jwksError.message?.includes('Expected 200 OK from the JSON Web Key Set') ||
                          jwksError.message?.includes('fetch failed') ||
                          jwksError.code === 'ETIMEDOUT' ||
                          jwksError.code === 'ECONNREFUSED' ||
                          jwksError.code === 'ENOTFOUND' ||
                          jwksError.code === 'ECONNRESET';
    
    // If it's a validation error, fail immediately - do NOT bypass security checks
    if (isValidationError && !isNetworkError) {
      console.error(`❌ [TOKEN VERIFY] JWKS validation failed - security check failed:`, jwksError.message);
      throw jwksError; // Fail immediately, do not fallback
    }
    
    // Only fallback to Graph API for network/timeout errors
    if (isNetworkError) {
      // SECURITY: Graph API fallback only allowed if ACCEPT_GRAPH_AUD is true
      // Otherwise, Graph-scoped tokens would be accepted during JWKS outages
      if (!ACCEPT_GRAPH_AUD) {
        console.error(`❌ [TOKEN VERIFY] JWKS network error, but Graph API fallback disabled (ACCEPT_GRAPH_AUD=false)`);
        throw new Error('Token validation failed: JWKS service unavailable and Graph API fallback is disabled');
      }
      
      console.warn(`⚠️ [TOKEN VERIFY] JWKS network/timeout error, falling back to Graph API:`, jwksError.message);
      jwksMetrics.graphApiFallbacks++;
      
      try {
        const response = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("Token validation failed");
        const userInfo = await response.json() as any;
        let email = userInfo.mail || userInfo.userPrincipalName;
        // normalize #EXT# pattern
        if (email && email.includes('#EXT#')) {
          const match = email.match(/^(.+?)_(.+?)#EXT#@/);
          if (match) email = `${match[1].replace(/_/g, '.')}@${match[2]}`;
        }
        // Derive display name: prefer displayName, fallback to givenName + surname, then email
        let displayName = userInfo.displayName;
        if (!displayName || displayName.toLowerCase() === 'unknown') {
          const givenName = userInfo.givenName;
          const surname = userInfo.surname;
          if (givenName && surname) {
            displayName = `${givenName} ${surname}`;
          } else if (givenName) {
            displayName = givenName;
          } else if (surname) {
            displayName = surname;
          } else {
            displayName = email;
          }
        }
        console.log('✅ [TOKEN VERIFY] Graph API fallback successful');
        return {
          email,
          name: displayName,
          oid: userInfo.id || email,
          preferred_username: email,
          friendlyEmail: isGuidUpn(email) ? undefined : email,
        };
      } catch (msError) {
        console.error("❌ [TOKEN VERIFY] Both JWKS and Graph API validation failed:", msError);
        throw msError;
      }
    }
    
    // Unknown error type - fail securely
    console.error(`❌ [TOKEN VERIFY] JWKS validation failed with unknown error:`, jwksError.message);
    throw jwksError;
  }
}

// Middleware: require valid token or session AND user must be registered in system
export async function tokenRequired(req: Request, res: Response, next: NextFunction) {
  // First check for Google session
  const session = (req as any).session;
  
  console.log("[AUTH] tokenRequired called for:", req.path);
  console.log("[AUTH] Session exists:", !!session);
  console.log("[AUTH] Session user:", session?.user?.email || "none");
  console.log("[AUTH] Authorization header present:", !!req.headers["authorization"]);
  
  if (session && session.user) {
    const sessionUser = session.user;
    
    // Verify Google session user exists in database
    try {
      const dbUser = await storage.getUserByEmail(sessionUser.email.toLowerCase().trim());
      
      if (!dbUser) {
        return res.status(403).json({ 
          error: "Access denied: User not registered in system",
          details: `Email address ${sessionUser.email} is not registered with the Zapper system. Please contact your administrator to request access.`
        });
      }
      
      // Check if user is enabled
      if (!dbUser.isEnabled) {
        return res.status(403).json({ 
          error: "Access denied: User account is disabled",
          details: `Your account has been disabled. Please contact your administrator.`
        });
      }
      
      // Check if user has at least one enabled organization role
      const enabledOrgs = await storage.getUserOrganizationIds(sessionUser.email.toLowerCase().trim());
      if (enabledOrgs.length === 0) {
        return res.status(403).json({ 
          error: "Access denied",
          details: `You do not have any active organization roles. Please contact your administrator to assign you to an organization.`
        });
      }
      
      (req as any).user = {
        email: sessionUser.email,
        name: sessionUser.name,
        oid: sessionUser.id || sessionUser.email,
        preferred_username: sessionUser.email
      };
      // Populate dbUser with organizationId for permission checks
      (req as any).dbUser = {
        ...dbUser,
        organizationId: enabledOrgs[0] // Use first enabled org
      };
      return next();
    } catch (dbError) {
      console.error("Database error during Google session verification:", dbError);
      return res.status(500).json({ error: "Internal server error during user verification" });
    }
  }

  // Check for Bearer token (both Microsoft and Google JWT tokens)
  const authHeader = req.headers["authorization"] || "";
  
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  
  verifyToken(token)
    .then(async (claims) => {
      // Additional security check: verify user exists in database
      const userEmail = claims.email || claims.preferred_username;
      
      if (!userEmail) {
        return res.status(403).json({ error: "Access denied: No email found in token" });
      }
      
      try {
        // Check if user exists in the database
        const dbUser = await storage.getUserByEmail(userEmail.toLowerCase().trim());
        
        if (!dbUser) {
          return res.status(403).json({ 
            error: "Access denied: User not registered in system",
            details: `Email address ${userEmail} is not registered with the Zapper system. Please contact your administrator to request access.`
          });
        }
        
        // Check if user is enabled
        if (!dbUser.isEnabled) {
          return res.status(403).json({ 
            error: "Access denied: User account is disabled",
            details: `Your account has been disabled. Please contact your administrator.`
          });
        }
        
        // Check if user has at least one enabled organization role
        const enabledOrgs = await storage.getUserOrganizationIds(userEmail.toLowerCase().trim());
        if (enabledOrgs.length === 0) {
          return res.status(403).json({ 
            error: "Access denied",
            details: `You do not have any active organization roles. Please contact your administrator to assign you to an organization.`
          });
        }
        
        // User is valid, proceed
        (req as any).user = claims;
        // Populate dbUser with organizationId for permission checks
        (req as any).dbUser = {
          ...dbUser,
          organizationId: enabledOrgs[0] // Use first enabled org
        };
        next();
      } catch (dbError) {
        console.error("Database error during user verification:", dbError);
        return res.status(500).json({ error: "Internal server error during user verification" });
      }
    })
    .catch(err => {
      if ((err as any).status === 401) {
        return res.status(401).json({ error: (err as any).message || "Unauthorized" });
      }
      console.error("Token verification error:", err);
      return res.status(401).json({ error: "Invalid token" });
    });
}

// Helper to check permissions in the database
export async function hasPermission(userEmail: string, permissionName: string): Promise<boolean> {
  try {
    console.log(`Checking permission for email: "${userEmail}", permission: "${permissionName}"`);
    const result = await storage.checkUserPermission(userEmail, permissionName);
    console.log(`Permission check result: ${result}`);
    return result;
  } catch (error: unknown) {
    console.error("Permission check error:", error);
    return false;
  }
}

// Middleware: require a specific permission
export function permissionRequired(permissionName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const email = user?.email || user?.preferred_username;
    
    if (!email) {
      return res.status(403).json({ error: "Forbidden: No user email found" });
    }

    const allowed = await hasPermission(email, permissionName);
    if (!allowed) {
      return res.status(403).json({ error: "Forbidden: You do not have the required permission" });
    }
    
    next();
  };
}

// Middleware: require AI agent specific permissions
export function aiAgentPermissionRequired(action: 'view' | 'add' | 'edit' | 'delete') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const email = user?.email || user?.preferred_username;
    
    if (!email) {
      return res.status(403).json({ error: "Forbidden: No user email found" });
    }

    // Check if user has AI agent permission for the specific action
    try {
      const hasAiAgentPermission = await storage.checkUserAiAgentPermission(email, action);
      
      if (!hasAiAgentPermission) {
        return res.status(403).json({ error: `Forbidden: You do not have permission to ${action} AI agents` });
      }
      next();
    } catch (error) {
      console.error("AI agent permission check error:", error);
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
}

// Export function to get JWKS metrics for monitoring
export function getJwksMetrics() {
  return {
    ...jwksMetrics,
    cacheHitRate: jwksMetrics.totalCalls > 0 
      ? ((jwksMetrics.cacheHits / jwksMetrics.totalCalls) * 100).toFixed(2) + '%'
      : '0%',
    successRate: jwksMetrics.totalCalls > 0
      ? ((jwksMetrics.jwksSuccesses / jwksMetrics.totalCalls) * 100).toFixed(2) + '%'
      : '0%',
    graphApiFallbackRate: jwksMetrics.totalCalls > 0
      ? ((jwksMetrics.graphApiFallbacks / jwksMetrics.totalCalls) * 100).toFixed(2) + '%'
      : '0%',
  };
}

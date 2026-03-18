import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { storage } from "./storage";
import { Request } from "express";
import { ActivityLogger, ActivityAction, ActivityCategory, ActivityActions, ActivityCategories, ResourceTypes, ResourceType } from "./activityLogger";

const GEO_CACHE_MAX_ENTRIES = 100;
const GEO_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface GeoCacheEntry {
  country: string;
  timestamp: number;
}

interface GeoPolicy {
  enabled: boolean;
  allowedCountries: string[];
  enforcementMode: 'strict' | 'audit';
}

interface GeoDecision {
  allowed: boolean;
  country: string | null;
  reason: string;
  cached: boolean;
  auditModeOverride?: boolean; // true when access is allowed due to audit mode (would have been blocked in strict mode)
}

export interface GeoAccessContext {
  req: Request;
  orgId: number;
  userId?: number;
  operation: string;
}

export class GeoRestrictionError extends Error {
  public readonly code = 'GEO_RESTRICTED';
  public readonly statusCode = 403;
  public readonly country: string;
  public readonly orgId: number;

  constructor(message: string, country: string, orgId: number) {
    super(message);
    this.name = 'GeoRestrictionError';
    this.country = country;
    this.orgId = orgId;
  }
}

class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  size(): number {
    return this.cache.size;
  }
}

const geoCache = new LRUCache<string, GeoCacheEntry>(GEO_CACHE_MAX_ENTRIES);

let azureMapsKey: string | null = null;
let azureMapsKeyLoaded = false;

async function loadAzureMapsKey(): Promise<string | null> {
  if (azureMapsKeyLoaded) return azureMapsKey;

  const geoFencingEnabled = process.env.ZAPPER_GEO_FENCING_ENABLED?.toLowerCase() === 'true';
  if (!geoFencingEnabled) {
    azureMapsKeyLoaded = true;
    return null;
  }

  const directKey = process.env.ZAPPER_AZURE_MAPS_KEY;
  if (directKey) {
    azureMapsKey = directKey;
    azureMapsKeyLoaded = true;
    console.log('[GEO] Azure Maps key loaded from environment variable');
    return azureMapsKey;
  }

  const useKeyVault = process.env.ZAPPER_USE_KEYVAULT?.toLowerCase() === 'true';
  if (useKeyVault) {
    const keyVaultUrl = process.env.KEY_VAULT_URL;
    const secretName = process.env.AZURE_MAPS_SECRET_NAME || 'AzureMapsKey';
    
    if (keyVaultUrl) {
      try {
        const credential = new DefaultAzureCredential();
        const client = new SecretClient(keyVaultUrl, credential);
        const secret = await client.getSecret(secretName);
        azureMapsKey = secret?.value?.trim() || null;
        if (azureMapsKey) {
          console.log('[GEO] Azure Maps key loaded from Key Vault');
        }
      } catch (err: any) {
        console.error('[GEO] Failed to load Azure Maps key from Key Vault:', err?.message);
      }
    }
  }

  azureMapsKeyLoaded = true;
  return azureMapsKey;
}

function stripPort(ip: string): string {
  if (!ip || ip === 'unknown') return ip;
  
  // Handle IPv6 with port: [::1]:8080 or [2001:db8::1]:8080
  if (ip.startsWith('[')) {
    const bracketEnd = ip.indexOf(']');
    if (bracketEnd !== -1) {
      return ip.slice(1, bracketEnd);
    }
  }
  
  // Handle IPv4 with port: 192.168.1.1:8080
  // Only strip if there's exactly one colon (IPv4 with port)
  // IPv6 addresses have multiple colons, so don't strip those
  const colonCount = (ip.match(/:/g) || []).length;
  if (colonCount === 1) {
    return ip.split(':')[0];
  }
  
  return ip;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const firstIp = forwardedStr.split(',')[0]?.trim();
    if (firstIp) return stripPort(firstIp);
  }
  
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    const ip = Array.isArray(realIp) ? realIp[0] : realIp;
    return stripPort(ip);
  }

  const rawIp = req.socket.remoteAddress || req.ip || 'unknown';
  return stripPort(rawIp);
}

function isPrivateIP(ip: string): boolean {
  if (ip === 'unknown' || ip === '::1' || ip === '127.0.0.1') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.')) {
    const secondOctet = parseInt(ip.split('.')[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  return false;
}

export async function resolveCountry(ip: string): Promise<string | null> {
  if (isPrivateIP(ip)) {
    console.log(`[GEO] Private/local IP detected: ${ip}, skipping geo lookup`);
    return null;
  }

  const cached = geoCache.get(ip);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < GEO_CACHE_TTL_MS) {
      console.log(`[GEO] Cache hit for IP ${ip}: ${cached.country}`);
      return cached.country;
    }
  }

  const mapsKey = await loadAzureMapsKey();
  if (!mapsKey) {
    console.log('[GEO] Azure Maps key not available, skipping geo lookup');
    return null;
  }

  try {
    const url = `https://atlas.microsoft.com/geolocation/ip/json?api-version=1.0&ip=${encodeURIComponent(ip)}&subscription-key=${mapsKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[GEO] Azure Maps API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const country = data?.countryRegion?.isoCode?.toUpperCase() || null;
    
    if (country) {
      geoCache.set(ip, { country, timestamp: Date.now() });
      console.log(`[GEO] Resolved IP ${ip} to country: ${country}`);
    } else {
      console.log(`[GEO] Could not resolve country for IP ${ip}`);
    }

    return country;
  } catch (err: any) {
    console.error(`[GEO] Error resolving country for IP ${ip}:`, err?.message);
    return null;
  }
}

export async function getOrgGeoPolicy(orgId: number): Promise<GeoPolicy> {
  try {
    const org = await storage.getOrganization(orgId);
    if (!org) {
      return { enabled: false, allowedCountries: [], enforcementMode: 'strict' };
    }

    // Read enforcementMode from database, default to 'strict' if not set
    const enforcementMode = (org as any).geoEnforcementMode === 'audit' ? 'audit' : 'strict';

    return {
      enabled: org.geoFencingEnabled ?? false,
      allowedCountries: (org.allowedCountries ?? []).map((c: string) => c.toUpperCase()),
      enforcementMode,
    };
  } catch (err: any) {
    console.error(`[GEO] Error loading geo policy for org ${orgId}:`, err?.message);
    return { enabled: false, allowedCountries: [], enforcementMode: 'strict' };
  }
}

export async function evaluateGeoAccess(context: GeoAccessContext): Promise<GeoDecision> {
  const { req, orgId, operation } = context;

  const geoFencingGlobalEnabled = process.env.ZAPPER_GEO_FENCING_ENABLED?.toLowerCase() === 'true';
  if (!geoFencingGlobalEnabled) {
    return { allowed: true, country: null, reason: 'Geo-fencing disabled globally', cached: false };
  }

  const policy = await getOrgGeoPolicy(orgId);
  if (!policy.enabled) {
    return { allowed: true, country: null, reason: 'Geo-fencing disabled for organization', cached: false };
  }

  if (policy.allowedCountries.length === 0) {
    return { allowed: true, country: null, reason: 'No country restrictions configured', cached: false };
  }

  const clientIp = getClientIp(req);
  
  if (isPrivateIP(clientIp)) {
    return { allowed: true, country: null, reason: 'Private/local IP - geo-check bypassed', cached: false };
  }

  const cached = geoCache.get(clientIp);
  const wasCached = cached && (Date.now() - cached.timestamp < GEO_CACHE_TTL_MS);
  
  const country = await resolveCountry(clientIp);
  
  // FAIL CLOSED: If geo resolution fails while geo-fencing is enabled, block access
  if (!country) {
    console.warn(`[GEO] FAIL CLOSED: Could not determine country for IP ${clientIp} during ${operation} - blocking access`);
    if (policy.enforcementMode === 'audit') {
      console.warn(`[GEO] AUDIT MODE: Would have blocked access for unknown country, allowing due to audit mode`);
      return { allowed: true, country: null, reason: 'Country could not be determined (audit mode)', cached: false };
    }
    return { 
      allowed: false, 
      country: null, 
      reason: 'Country could not be determined - access denied for security', 
      cached: false 
    };
  }

  const isAllowed = policy.allowedCountries.includes(country);

  // Handle audit mode - log but allow
  if (!isAllowed && policy.enforcementMode === 'audit') {
    console.warn(`[GEO] AUDIT MODE: Would have blocked ${country} for ${operation}, allowing due to audit mode`);
    return {
      allowed: true,
      country,
      reason: `Country ${country} would be blocked (audit mode) - allowed list: ${policy.allowedCountries.join(', ')}`,
      cached: !!wasCached,
      auditModeOverride: true, // Mark that this was allowed due to audit mode
    };
  }

  return {
    allowed: isAllowed,
    country,
    reason: isAllowed 
      ? `Country ${country} is in allowed list` 
      : `Country ${country} is not in allowed list: ${policy.allowedCountries.join(', ')}`,
    cached: !!wasCached,
  };
}

export async function enforceGeoAccess(context: GeoAccessContext): Promise<GeoDecision> {
  const { req, orgId, userId, operation } = context;
  
  const decision = await evaluateGeoAccess(context);
  
  const clientIp = getClientIp(req);
  
  // Audit log every geo decision (console JSON)
  const auditLog = createGeoAuditLog(context, decision);
  console.log(`[GEO-AUDIT] ${JSON.stringify(auditLog)}`);

  console.log(`[GEO] Access evaluation - org:${orgId} user:${userId || 'unknown'} ip:${clientIp} country:${decision.country || 'unknown'} op:${operation} result:${decision.allowed ? 'allowed' : 'blocked'} cached:${decision.cached}`);

  // Log to ActivityLogger for compliance (GEO_ACCESS_ALLOWED, GEO_ACCESS_ALLOWED_AUDIT, or GEO_ACCESS_BLOCKED)
  try {
    // Determine the correct action based on decision and audit mode
    let action: ActivityAction;
    if (!decision.allowed) {
      action = ActivityActions.GEO_ACCESS_BLOCKED;
    } else if (decision.auditModeOverride) {
      action = ActivityActions.GEO_ACCESS_ALLOWED_AUDIT; // Access allowed due to audit mode (would have been blocked in strict mode)
    } else {
      action = ActivityActions.GEO_ACCESS_ALLOWED;
    }
    const user = (req as any).user;
    
    // Fetch organization and role info if available to ensure logs are not "Unknown"
    let organizationName = (req as any).organizationName;
    let roleId = (req as any).roleId;
    let roleName = (req as any).roleName;

    if (!organizationName || !roleName) {
      try {
        const org = await storage.getOrganization(orgId);
        organizationName = org?.name;
        
        const userEmail = user?.email;
        if (userEmail) {
          const userRoles = await storage.getUserRolesByEmail(userEmail);
          const primaryRole = userRoles.find(ur => ur.organization.id === orgId) || userRoles[0];
          if (primaryRole) {
            roleId = primaryRole.role.id;
            roleName = primaryRole.role.name;
          }
        }
      } catch (err) {
        console.error(`[GEO] Failed to fetch context for logging:`, err);
      }
    }

    await ActivityLogger.log({
      userId: String(userId ?? user?.oid ?? user?.id ?? 0),
      userName: user?.displayName || user?.name || 'System',
      email: user?.email || 'system@zapper.local',
      organizationId: orgId,
      organizationName: organizationName || 'Unknown',
      roleId: roleId,
      roleName: roleName || 'Unknown',
      action,
      actionCategory: ActivityCategories.GEO_FENCING as ActivityCategory,
      resource: `${operation}`,
      resourceType: ResourceTypes.FILE as ResourceType,
      ipAddress: clientIp,
      details: {
        country: decision.country,
        reason: decision.reason,
        cached: decision.cached,
        operation,
        auditModeOverride: decision.auditModeOverride || false,
        enforcementMode: decision.auditModeOverride ? 'audit' : 'strict',
      },
    });
  } catch (logErr: any) {
    console.error(`[GEO] Failed to log geo decision to ActivityLogger:`, logErr?.message);
  }

  if (!decision.allowed) {
    throw new GeoRestrictionError(
      'Data access from your current country is restricted by your organization.',
      decision.country || 'unknown',
      orgId
    );
  }

  return decision;
}

export function isGeoRestrictionError(error: any): error is GeoRestrictionError {
  return error instanceof GeoRestrictionError || error?.code === 'GEO_RESTRICTED';
}

export function getCacheStats(): { size: number; maxSize: number } {
  return {
    size: geoCache.size(),
    maxSize: GEO_CACHE_MAX_ENTRIES,
  };
}

export function isGeoFencingEnabled(): boolean {
  return process.env.ZAPPER_GEO_FENCING_ENABLED?.toLowerCase() === 'true';
}

export interface GeoAuditLog {
  event: 'GEO_ACCESS_EVALUATED';
  orgId: number;
  userId?: number;
  ip: string;
  country: string | null;
  operation: string;
  result: 'allowed' | 'blocked';
  reason: string;
  cached: boolean;
  timestamp: string;
}

export function createGeoAuditLog(
  context: GeoAccessContext,
  decision: GeoDecision
): GeoAuditLog {
  return {
    event: 'GEO_ACCESS_EVALUATED',
    orgId: context.orgId,
    userId: context.userId,
    ip: getClientIp(context.req),
    country: decision.country,
    operation: context.operation,
    result: decision.allowed ? 'allowed' : 'blocked',
    reason: decision.reason,
    cached: decision.cached,
    timestamp: new Date().toISOString(),
  };
}

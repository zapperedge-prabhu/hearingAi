# Zapper Edge Security Audit Report

**Report Date:** January 15, 2026  
**Report Type:** Pre-Production Security Assessment  
**Classification:** Internal - For Security Team Review  
**Status:** Report Only - No Code Changes Implemented

---

## Executive Summary

This comprehensive security audit was conducted across multiple security domains including API Security, Code Security, Product Security, Database Security, and Penetration Testing perspectives. The audit identified findings across all severity levels that should be reviewed by the security team before production deployment.

**Finding Summary:**
| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 8 |
| Low | 6 |
| Informational | 4 |

---

## SECTION 1: API SECURITY EXPERT FINDINGS

### CRITICAL-01: Overly Permissive JWT Audience Validation

**File:** `server/auth.ts`, Lines 11, 93-98  
**Severity:** CRITICAL  
**CVSS Score:** 9.1

**Description:**  
The `ACCEPT_GRAPH_AUD` environment variable defaults to `"true"`, allowing any Microsoft Graph access token to be accepted as valid application authentication. This means any user in any Azure AD tenant who can obtain a Graph token can potentially bypass audience validation and access internal APIs.

**Code Evidence:**
```typescript
// Line 11
const ACCEPT_GRAPH_AUD = (process.env.ZAPPER_ACCEPT_GRAPH_AUDIENCE || "true").toLowerCase() === "true";

// Lines 93-98
const graphAud = "00000003-0000-0000-c000-000000000000"; // Microsoft Graph
const audOk = (aud === CLIENT_ID) || (ACCEPT_GRAPH_AUD && aud === graphAud);
```

**Risk:**  
- Attackers with any Azure AD access can mint Graph tokens and authenticate
- Bypasses application-specific audience validation
- Enables unauthorized API access across tenant boundaries

**Recommendation for Team Discussion:**  
Consider setting `ZAPPER_ACCEPT_GRAPH_AUDIENCE=false` in production unless there's a specific business requirement.

---

### CRITICAL-02: Sensitive Credentials Logged in API Responses

**File:** `server/index.ts`, Lines 66-104 (approximately)  
**Severity:** CRITICAL  
**CVSS Score:** 8.5

**Description:**  
The application logs every `/api` response payload verbatim. Endpoints such as SFTP credential creation and rotation return secrets (private keys, passwords). These are consequently persisted in server logs, enabling credential compromise if logs are accessed.

**Affected Endpoints:**
- `POST /api/sftp-local-users` - Returns secretToken for credential download
- `POST /api/sftp-local-users/:id/rotate-ssh` - Returns new SSH private key token
- `POST /api/sftp-local-users/:id/rotate-password` - Returns new password token
- `GET /api/sftp-local-users/download/:token` - Returns actual private key or password

**Risk:**
- Credentials exposed in application logs
- Log aggregation systems may store secrets permanently
- Compliance violation (secrets in plaintext logs)
- Lateral movement if logs are compromised

**Recommendation for Team Discussion:**  
Implement log redaction for sensitive fields or disable response body logging for credential endpoints.

---

### HIGH-01: No Rate Limiting Implementation

**File:** Server-wide  
**Severity:** HIGH  
**CVSS Score:** 7.5

**Description:**  
The application has no explicit rate limiting on any API endpoints. This leaves the system vulnerable to brute force attacks and denial of service.

**Vulnerable Attack Vectors:**
- Authentication endpoints (credential stuffing)
- User enumeration via `/api/user-exists`
- Resource-intensive endpoints (file operations, AI processing)
- Password/SSH key rotation endpoints

**Risk:**
- Brute force attacks on authentication
- Denial of service through resource exhaustion
- Account lockout bypass
- Credential stuffing attacks

**Recommendation for Team Discussion:**  
Consider implementing rate limiting middleware (e.g., express-rate-limit) before production.

---

### HIGH-02: User Enumeration via API Endpoints

**File:** `server/routes.ts`  
**Severity:** HIGH  
**CVSS Score:** 6.5

**Description:**  
Several endpoints allow authenticated users to enumerate users across the system:

**Vulnerable Endpoints:**
- `GET /api/user-exists?email=...` - Returns whether email exists
- `GET /api/organization-users` - Lists users without strict organization scoping
- `GET /api/users` - User listing endpoint

**Risk:**
- Attackers can enumerate valid email addresses
- Facilitates targeted phishing attacks
- Enables credential stuffing attack preparation

---

### MEDIUM-01: SSO Configuration Exposed Without Authentication

**File:** `server/routes.ts`, Lines 1205-1217  
**Severity:** MEDIUM  
**CVSS Score:** 4.3

**Description:**  
The `/api/sso-config` endpoint is publicly accessible without authentication, exposing configuration details about authentication providers.

**Code Evidence:**
```typescript
app.get("/api/sso-config", (req, res) => {
  const config = getSSOConfig();
  res.json({
    ssoFeature: config.ssoFeature,
    supportsMicrosoft: config.supportsMicrosoft,
    supportsGoogle: config.supportsGoogle,
    // ...
  });
});
```

**Risk:**
- Exposes which authentication providers are configured
- Could help attackers plan targeted attacks
- Information disclosure (reconnaissance value)

---

### MEDIUM-02: Mock Tenant ID in Configuration Fallback

**File:** `server/routes/config.ts`, Line 17  
**Severity:** MEDIUM  
**CVSS Score:** 5.0

**Description:**  
A hardcoded mock tenant ID is used as a fallback in configuration:

```typescript
authority = authority || "https://login.microsoftonline.com/mock-tenant-id";
```

**Risk:**
- If environment variables are not set, authentication may fail silently
- Potential for misconfiguration in production
- Could cause unexpected authentication behavior

---

### MEDIUM-03: Sentinel Health Endpoint Lacks Permission Check

**File:** `server/routes.ts`, Lines 1220-1233  
**Severity:** MEDIUM  
**CVSS Score:** 4.0

**Description:**  
The `/api/sentinel/health` endpoint only requires `tokenRequired` but no specific permission check, potentially exposing system health information to any authenticated user.

**Risk:**
- Any authenticated user can probe Sentinel integration status
- Exposes infrastructure information
- Could reveal security monitoring gaps

---

## SECTION 2: CODE SECURITY EXPERT FINDINGS

### CRITICAL-03: Sensitive Data Storage in Plaintext

**File:** `server/storage.ts`, Database layer  
**Severity:** CRITICAL  
**CVSS Score:** 8.0

**Description:**  
When `ZAPPER_READ_PGP_MY_KB` is not set to `true`, private PGP keys are stored in plaintext in the PostgreSQL database rather than Azure Key Vault.

**Code Evidence (server/pgp-utils.ts):**
```typescript
if (databasePrivateKeyData) {
  console.log('Retrieving private key from database');
  return databasePrivateKeyData;  // Plaintext from DB
}
```

**Risk:**
- Database compromise exposes all private keys
- Violates data-at-rest protection requirements
- Compliance implications (SOC2, HIPAA, etc.)
- No encryption for sensitive cryptographic material

**Recommendation for Team Discussion:**  
Ensure `ZAPPER_READ_PGP_MY_KB=true` in production to force Key Vault storage.

---

### HIGH-03: Console Logging of Security-Sensitive Operations

**Files:** Multiple files across server/  
**Severity:** HIGH  
**CVSS Score:** 6.0

**Description:**  
Extensive console logging includes security-sensitive information:

**Examples Found:**
- `server/routes.ts:6194` - Logs whether Azure client secret is set
- `server/routes.ts:6232` - Logs storage account key retrieval success
- `server/keyvault-keys.ts` - Logs key vault key operations
- Various PGP key operation logs

**Risk:**
- Security configuration information in logs
- Operational security details exposed
- Timing information for key operations

---

### HIGH-04: Error Messages May Leak Internal Details

**Files:** Server-wide error handlers  
**Severity:** HIGH  
**CVSS Score:** 5.5

**Description:**  
Error handling in several places passes through internal error messages to clients:

**Pattern Observed:**
```typescript
catch (error: any) {
  res.status(500).json({ error: error.message });  // Internal error exposed
}
```

**Risk:**
- Stack traces could be exposed in production
- Internal paths and configuration exposed
- Database error messages may reveal schema

---

### MEDIUM-04: CSP Allows Unsafe Inline and Eval

**File:** `server/index.ts`, Lines 46-58  
**Severity:** MEDIUM  
**CVSS Score:** 5.0

**Description:**  
Content Security Policy in production allows `'unsafe-inline'` and `'unsafe-eval'`:

```typescript
scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
styleSrc: ["'self'", "'unsafe-inline'"],
```

**Risk:**
- Reduces XSS protection
- Allows inline script injection
- eval() based attacks possible

---

### MEDIUM-05: CSP Disabled in Development Mode

**File:** `server/index.ts`, Lines 45-58  
**Severity:** MEDIUM  
**CVSS Score:** 4.0

**Description:**  
Content Security Policy is completely disabled when `NODE_ENV !== 'production'`:

```typescript
contentSecurityPolicy: isProduction ? { ... } : false,
```

**Risk:**
- Development environments have no CSP protection
- Developers may not notice CSP violations until production
- Testing may not reflect production security posture

---

## SECTION 3: PRODUCT SECURITY EXPERT FINDINGS

### HIGH-05: Cross-Organization Resource Access Vectors

**Files:** `server/auth-middleware.ts`, `server/routes.ts`  
**Severity:** HIGH  
**CVSS Score:** 7.0

**Description:**  
While IDOR protections exist, several areas need verification:

**Areas Requiring Review:**
1. Foundry AI management - Organization scoping verification needed
2. PGP key management - Cross-org key access prevention
3. AI Agent management - Organization boundary enforcement
4. Storage account operations - Multi-tenant isolation

**Current Protections:**
- `organizationAccessRequired` middleware exists
- Permission checks are implemented per module
- User email validation is performed

**Risk:**
- Potential for accessing resources across organization boundaries
- Multi-tenant isolation bypass if middleware is bypassed

---

### MEDIUM-06: Credential Download Window (120 seconds)

**File:** `server/azureSftpLocalUsersService.ts`  
**Severity:** MEDIUM  
**CVSS Score:** 4.5

**Description:**  
SFTP credentials are cached for 120 seconds with a one-time download mechanism. If the token is intercepted during this window, credentials could be stolen.

**Risk:**
- Time window for credential interception
- Token could be sniffed if HTTPS is compromised
- No additional verification for download

---

### MEDIUM-07: Session Fixation Protection Unclear

**File:** `server/index.ts`, Lines 68-86  
**Severity:** MEDIUM  
**CVSS Score:** 5.0

**Description:**  
While express-session is configured, explicit session regeneration on authentication is not visible in the code. Standard practice requires regenerating session IDs after privilege changes.

**Current Configuration:**
```typescript
session({
  secret: process.env.ZAPPER_JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, httpOnly: true, sameSite: 'lax' }
})
```

**Risk:**
- Session fixation attacks may be possible
- Pre-authentication session could be reused post-auth

---

### LOW-01: Cookie Security in Non-Production

**File:** `server/index.ts`, Line 80  
**Severity:** LOW  
**CVSS Score:** 3.0

**Description:**  
Session cookie `secure` flag is only set in production:

```typescript
secure: process.env.NODE_ENV === "production",
```

**Risk:**
- Cookies transmitted over HTTP in development
- Man-in-the-middle possible in development environments

---

## SECTION 4: DATABASE SECURITY EXPERT FINDINGS

### MEDIUM-08: Database Credentials in Session Store

**File:** `server/index.ts`, Lines 71-75  
**Severity:** MEDIUM  
**CVSS Score:** 4.5

**Description:**  
Session store uses the same PostgreSQL pool as the main application:

```typescript
store: new PgSession({
  pool,  // Same pool as application data
  tableName: "session",
})
```

**Risk:**
- Session data in same database as application data
- Single point of compromise
- Session hijacking if database is breached

---

### LOW-02: Auto-Table Creation in Production

**File:** `server/db.ts`, Lines 27-140  
**Severity:** LOW  
**CVSS Score:** 2.5

**Description:**  
Database tables can be auto-created when `ZAPPER_AUTO_CREATE_DB_TABLES=true`:

**Risk:**
- Schema modifications possible in production
- Potential for unexpected table structure changes
- Should be disabled in production

---

### LOW-03: Plaintext Environment Variable Dependencies

**File:** Server-wide configuration  
**Severity:** LOW  
**CVSS Score:** 3.0

**Description:**  
Multiple sensitive configurations depend on environment variables:

**Critical Environment Variables:**
- `ZAPPER_JWT_SECRET` - Session signing
- `ZAPPER_AZURE_CLIENT_SECRET` - Azure authentication
- `DATABASE_URL` - Database connection
- `KEY_VAULT_URL` - Key Vault access

**Risk:**
- Environment variable exposure in process listings
- Container escape could reveal secrets
- Log files might capture environment on startup

---

## SECTION 5: PENETRATION TESTER PERSPECTIVE

### Attack Surface Analysis

**Exposed API Endpoints:** 87+ documented endpoints  
**Authentication Methods:** Azure AD, Google OAuth, Session-based  
**Data Storage:** PostgreSQL, Azure Blob Storage, Azure Key Vault

### OWASP Top 10 Mapping

| OWASP Category | Status | Notes |
|---------------|--------|-------|
| A01:2021 Broken Access Control | PARTIAL | IDOR protections exist but need verification |
| A02:2021 Cryptographic Failures | CONCERN | PGP keys may be stored in plaintext DB |
| A03:2021 Injection | GOOD | Drizzle ORM with parameterized queries |
| A04:2021 Insecure Design | PARTIAL | Some design decisions need review |
| A05:2021 Security Misconfiguration | CONCERN | Default audience acceptance, no rate limiting |
| A06:2021 Vulnerable Components | UNKNOWN | Dependency audit not performed |
| A07:2021 Auth Failures | CONCERN | Graph audience bypass possible |
| A08:2021 Data Integrity Failures | GOOD | Input validation implemented |
| A09:2021 Logging Failures | CONCERN | Secrets logged in responses |
| A10:2021 SSRF | GOOD | Azure URL validation implemented |

### Potential Exploit Chains

**Chain 1: Token Audience Bypass -> Data Exfiltration**
1. Attacker obtains Microsoft Graph token (easy for any AAD user)
2. Uses Graph token to authenticate to Zapper API
3. Accesses organization data they shouldn't have access to

**Chain 2: Log Access -> Credential Theft**
1. Attacker gains access to application logs (misconfigured log aggregator)
2. Searches for SFTP credential creation/rotation events
3. Extracts private keys/passwords from logged responses
4. Uses credentials for SFTP access

**Chain 3: User Enumeration -> Targeted Attack**
1. Attacker uses `/api/user-exists` to enumerate valid emails
2. Cross-references with known data breaches
3. Attempts credential stuffing (no rate limiting)
4. Compromises user account

---

## SECTION 6: INFORMATIONAL FINDINGS

### INFO-01: Extensive Debug Logging in Production

**Description:** High volume of debug-level logging exists that may impact performance and create large log files.

### INFO-02: CORS Policy Review Recommended

**File:** `server/index.ts`  
**Description:** `crossOriginResourcePolicy: { policy: "cross-origin" }` is configured. Verify this is necessary for Azure blob access.

### INFO-03: Help Center RBAC Implementation

**Description:** Help Center access is controlled via chapter-level permissions. Verify all sensitive chapters are properly restricted.

### INFO-04: Activity Logging Coverage

**Description:** Comprehensive activity logging is implemented. Verify all security-relevant events are captured and log retention policies are defined.

---

## RECOMMENDATIONS SUMMARY

### Before Production Deployment (Critical)

1. **Set `ZAPPER_ACCEPT_GRAPH_AUDIENCE=false`** unless specifically required
2. **Implement log redaction** for credential-related API responses
3. **Verify `ZAPPER_READ_PGP_MY_KB=true`** for Key Vault storage of private keys

### High Priority (Within First Week)

4. Implement rate limiting on authentication and sensitive endpoints
5. Review and restrict `/api/user-exists` endpoint
6. Add permission checks to `/api/sentinel/health`
7. Audit all cross-organization data access paths

### Medium Priority (Within First Month)

8. Remove `'unsafe-inline'` and `'unsafe-eval'` from CSP where possible
9. Implement explicit session regeneration on authentication
10. Review error message exposure in all catch blocks
11. Audit console.log statements for sensitive information

### Low Priority (Ongoing)

12. Perform dependency vulnerability audit
13. Implement security headers audit in CI/CD
14. Create security monitoring dashboards
15. Establish log retention and security policies

---

## APPENDIX A: Files Reviewed

- server/auth.ts
- server/auth-middleware.ts
- server/routes.ts
- server/routes/help.ts
- server/routes/config.ts
- server/index.ts
- server/storage.ts
- server/db.ts
- server/validation.ts
- server/pgp-utils.ts
- server/keyvault-keys.ts
- server/acaZipperService.ts
- server/azureSftpLocalUsersService.ts
- server/activityLogger.ts
- shared/schema.ts
- client/src/lib/api.ts
- client/src/lib/queryClient.ts

---

## APPENDIX B: Testing Recommendations for Pen Test

### Authentication Testing
- Test Graph token acceptance with different tenant IDs
- Verify JWT expiration handling
- Test session management and timeout behavior

### Authorization Testing
- Attempt cross-organization data access
- Test IDOR on all resource IDs (organization, user, role, storage account, SFTP user)
- Verify permission enforcement at all endpoints

### Input Validation Testing
- Test all text fields for injection patterns
- Verify file upload restrictions
- Test path traversal in file operations

### Business Logic Testing
- Test credential rotation timing
- Verify PGP key isolation between organizations
- Test concurrent operations for race conditions

---

**Report Prepared By:** Security Analysis Agent  
**Review Status:** Pending Team Review  
**Next Steps:** Discuss findings with security team before production deployment

---

*This report is intended for internal security review only. No code modifications have been made. All findings require team discussion and verification before remediation decisions.*

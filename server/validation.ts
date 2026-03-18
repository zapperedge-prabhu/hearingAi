import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// ============================================================================
// INPUT VALIDATION UTILITIES
// ============================================================================
// Security: Prevent SQL injection and data integrity issues through
// comprehensive input validation before database operations

/**
 * Email validation regex
 * Validates standard email format: user@domain.tld
 * Security: Rejects SQL injection patterns, quotes, special characters
 * RFC 5322 simplified: allows alphanumeric, dots, hyphens, plus signs
 */
const EMAIL_REGEX = /^[a-zA-Z0-9.!#+\-/=?^_`{|}~]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Maximum length constraints for text fields
 * Prevents abuse and ensures database field limits are respected
 */
export const MAX_LENGTHS = {
  NAME: 255,
  EMAIL: 255,
  DESCRIPTION: 1000,
  STORAGE_ACCOUNT_NAME: 24, // Azure storage account name limit
  CONTAINER_NAME: 63, // Azure container name limit
  ROLE_NAME: 100,
  ORGANIZATION_NAME: 100,
  AI_AGENT_NAME: 32, // As per schema
  API_ENDPOINT: 192, // As per schema
  IP_ADDRESS: 45, // IPv6 max length
};

/**
 * Validate email format
 * @param email - Email address to validate
 * @returns true if valid, false otherwise
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // Check length (RFC 5321: max 254 characters total, 64 local part)
  if (email.length > MAX_LENGTHS.EMAIL) {
    return false;
  }
  
  // Security: Block null bytes (injection attempts)
  if (email.includes('\0') || email.includes('%00') || email.includes('\\x00')) {
    return false;
  }
  
  // Security: Block SQL injection patterns
  // Reject emails containing SQL keywords and syntax
  const sqlInjectionPatterns = [
    /['"`]/,  // Single/double/backtick quotes
    /;/,      // Statement terminator
    /-{2}/,   // SQL comment marker --
    /\/\*/,   // Block comment start /*
    /OR\s/i,  // OR keyword
    /AND\s/i, // AND keyword
    /DROP/i,  // DROP keyword
    /DELETE/i,// DELETE keyword
    /INSERT/i,// INSERT keyword
    /UPDATE/i,// UPDATE keyword
    /SELECT/i,// SELECT keyword
    /UNION/i, // UNION keyword
  ];
  
  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(email)) {
      return false;
    }
  }
  
  // Check format using RFC-compliant regex
  return EMAIL_REGEX.test(email);
}

/**
 * Validate integer ID parameter
 * Ensures ID is a valid positive integer
 * @param value - Value to validate (from req.params or req.query)
 * @returns Parsed integer or null if invalid
 */
export function validateIntegerId(value: string | undefined | null): number | null {
  if (!value) {
    return null;
  }
  
  const parsed = parseInt(value, 10);
  
  // Check if valid positive integer
  if (isNaN(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return null;
  }
  
  return parsed;
}

/**
 * Validate text field length and content
 * @param value - Text to validate
 * @param maxLength - Maximum allowed length
 * @param fieldName - Field name for error messages
 * @returns Validation result with error message if invalid
 */
export function validateTextField(
  value: string | null | undefined,
  maxLength: number,
  fieldName: string = 'Field'
): { valid: boolean; error?: string; sanitized?: string } {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: `${fieldName} is required` };
  }
  
  // Trim whitespace
  const sanitized = value.trim();
  
  // Check if empty after trimming
  if (sanitized.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }
  
  // Check length
  if (sanitized.length > maxLength) {
    return { 
      valid: false, 
      error: `${fieldName} must be ${maxLength} characters or less (got ${sanitized.length})` 
    };
  }
  
  return { valid: true, sanitized };
}

/**
 * Validate organization ID from query/body and ensure it's accessible
 * @param value - Organization ID to validate
 * @returns Parsed integer or null if invalid
 */
export function validateOrganizationId(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  
  // Handle numeric input
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) {
      return null;
    }
    return value;
  }
  
  // Handle string input
  return validateIntegerId(String(value));
}

// ============================================================================
// EXPRESS MIDDLEWARE FOR ID VALIDATION
// ============================================================================

/**
 * Middleware: Validate integer ID in req.params.id
 * Stores validated ID in req.validatedId
 */
export function validateParamId(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = validateIntegerId(req.params[paramName]);
    
    if (id === null) {
      return res.status(400).json({ 
        error: `Invalid ${paramName}: must be a positive integer`,
        received: req.params[paramName]
      });
    }
    
    // Store validated ID for use in route handler
    (req as any)[`validated${paramName.charAt(0).toUpperCase() + paramName.slice(1)}`] = id;
    next();
  };
}

/**
 * Middleware: Validate multiple integer IDs in req.params
 * Usage: validateMultipleParamIds(['userId', 'roleId', 'organizationId'])
 */
export function validateMultipleParamIds(paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = [];
    
    for (const paramName of paramNames) {
      const id = validateIntegerId(req.params[paramName]);
      
      if (id === null) {
        errors.push(`Invalid ${paramName}: must be a positive integer (received: ${req.params[paramName]})`);
      } else {
        // Store validated ID
        (req as any)[`validated${paramName.charAt(0).toUpperCase() + paramName.slice(1)}`] = id;
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid request parameters',
        details: errors
      });
    }
    
    next();
  };
}

/**
 * Middleware: Validate integer ID in req.query
 */
export function validateQueryId(queryParam: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const value = req.query[queryParam];
    const id = validateIntegerId(value as string);
    
    if (id === null && value !== undefined) {
      return res.status(400).json({ 
        error: `Invalid ${queryParam}: must be a positive integer`,
        received: value
      });
    }
    
    // Store validated ID (or null if not provided)
    (req as any)[`validated${queryParam.charAt(0).toUpperCase() + queryParam.slice(1)}`] = id;
    next();
  };
}

/**
 * Middleware: Validate email in request body
 */
export function validateEmailInBody(req: Request, res: Response, next: NextFunction) {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  if (!isValidEmail(email)) {
    return res.status(400).json({ 
      error: 'Invalid email format',
      received: email
    });
  }
  
  // Normalize email to lowercase for consistency
  req.body.email = email.toLowerCase().trim();
  next();
}

/**
 * Validate filter string (for role/organization filters)
 * Security: Prevents SQL wildcards, DoS attacks, and injection patterns
 * Blocks: SQL wildcards (%, _), quotes, semicolons, comments, keywords
 * Allows: Alphanumeric, spaces, hyphens, underscores, dots, @
 * @param value - Filter string to validate
 * @param fieldName - Field name for error messages
 * @param maxLength - Maximum allowed length (defaults to ROLE_NAME length)
 * @returns Validation result with error message if invalid
 */
export function validateFilterString(
  value: string | null | undefined,
  fieldName: string = 'Filter',
  maxLength: number = MAX_LENGTHS.ROLE_NAME
): { valid: boolean; error?: string; sanitized?: string } {
  // If not provided or is "all", it's valid
  if (!value || value === 'all') {
    return { valid: true, sanitized: value || 'all' };
  }
  
  // Must be a string
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  
  // Check for null bytes - security risk
  if (value.includes('\0') || value.includes('%00')) {
    return { 
      valid: false, 
      error: `${fieldName} contains invalid null bytes` 
    };
  }
  
  // Trim whitespace
  const sanitized = value.trim();
  
  // Check if empty after trimming
  if (sanitized.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }
  
  // 🔒 SECURITY: Block SQL wildcards (%, _) that could modify search behavior
  if (sanitized.includes('%') || sanitized.includes('_')) {
    return { 
      valid: false, 
      error: `${fieldName} cannot contain SQL wildcards (%, _)` 
    };
  }
  
  // 🔒 SECURITY: Block SQL injection patterns
  const forbiddenPatterns = [
    /'/,      // Single quote
    /"/,      // Double quote
    /`/,      // Backtick
    /;/,      // Statement terminator
    /-{2}/,   // SQL comment marker --
    /\/\*/,   // Block comment start /*
    /\*\//,   // Block comment end */
    /\x00/,   // Null byte (binary 0)
  ];
  
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(sanitized)) {
      const char = pattern.source.replace(/\//g, '');
      return { 
        valid: false, 
        error: `${fieldName} contains forbidden characters: ${char}` 
      };
    }
  }
  
  // 🔒 SECURITY: Block SQL keywords commonly used in injection attacks
  const sqlKeywords = ['OR', 'AND', 'DROP', 'DELETE', 'INSERT', 'UPDATE', 'SELECT', 'UNION', 'EXEC', 'EXECUTE'];
  const upperValue = sanitized.toUpperCase();
  for (const keyword of sqlKeywords) {
    // Only block if it's a whole word (surrounded by spaces or at boundaries)
    if (new RegExp(`(^|\\s)${keyword}(\\s|$)`).test(upperValue)) {
      return { 
        valid: false, 
        error: `${fieldName} contains SQL keywords` 
      };
    }
  }
  
  // Enforce maximum length to prevent DoS attacks
  if (sanitized.length > maxLength) {
    return { 
      valid: false, 
      error: `${fieldName} must be ${maxLength} characters or less (got ${sanitized.length})` 
    };
  }
  
  // 🔒 SECURITY: Allow only alphanumeric, spaces, hyphens, underscores, dots, @
  // This covers: role names, org names, email-like filters
  if (!/^[a-zA-Z0-9\s\-_@.]+$/.test(sanitized)) {
    return { 
      valid: false, 
      error: `${fieldName} contains invalid characters. Allowed: letters, numbers, spaces, hyphens, underscores, dots, @` 
    };
  }
  
  return { valid: true, sanitized };
}

/**
 * Validate file search query string
 * Designed specifically for ADLS file search - allows common filename characters
 * including underscores, dots, hyphens, spaces, and percent signs.
 * 
 * Security: Prevents DoS attacks (length limits), null bytes, control characters,
 * and path traversal patterns. Does NOT block SQL wildcards since ADLS search
 * uses Azure's listPaths() API - no SQL is involved.
 * 
 * @param value - Search query string to validate
 * @param fieldName - Field name for error messages
 * @param maxLength - Maximum allowed length (defaults to 200)
 * @returns Validation result with error message if invalid
 */
export function validateSearchQuery(
  value: string | null | undefined,
  fieldName: string = 'Search query',
  maxLength: number = 200
): { valid: boolean; error?: string; sanitized?: string } {
  // Must be provided
  if (!value) {
    return { valid: false, error: `${fieldName} is required` };
  }
  
  // Must be a string
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  
  // Trim whitespace
  const sanitized = value.trim();
  
  // Check if empty after trimming
  if (sanitized.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }
  
  // 🔒 SECURITY: Block null bytes - can cause security issues
  if (sanitized.includes('\0') || sanitized.includes('%00')) {
    return { 
      valid: false, 
      error: `${fieldName} contains invalid null bytes` 
    };
  }
  
  // 🔒 SECURITY: Block control characters (ASCII 0-31 except tab, newline)
  // These can cause display issues and potential security problems
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(sanitized)) {
    return { 
      valid: false, 
      error: `${fieldName} contains invalid control characters` 
    };
  }
  
  // 🔒 SECURITY: Block path traversal patterns
  // Prevents searching for "../" patterns that could indicate malicious intent
  if (sanitized.includes('..') || sanitized.includes('..\\')) {
    return { 
      valid: false, 
      error: `${fieldName} cannot contain path traversal patterns (..)` 
    };
  }
  
  // 🔒 SECURITY: Enforce maximum length to prevent DoS attacks
  if (sanitized.length > maxLength) {
    return { 
      valid: false, 
      error: `${fieldName} must be ${maxLength} characters or less (got ${sanitized.length})` 
    };
  }
  
  // 🔒 SECURITY: Minimum length to prevent overly broad searches
  if (sanitized.length < 1) {
    return { 
      valid: false, 
      error: `${fieldName} must be at least 1 character` 
    };
  }
  
  // Allow common filename characters:
  // - Letters (a-z, A-Z)
  // - Numbers (0-9)
  // - Underscores (_) - very common in filenames
  // - Hyphens (-) - common in filenames
  // - Dots (.) - file extensions
  // - Spaces - common in user-created files
  // - Percent (%) - URL-encoded characters in filenames
  // - Parentheses () - common in versioned files like "document (1).pdf"
  // - Brackets [] - sometimes used in filenames
  // - Plus (+) - sometimes used in filenames
  // - Ampersand (&) - sometimes used in filenames
  // - At (@) - sometimes used in filenames
  // - Hash (#) - sometimes used in filenames
  // - Exclamation (!) - sometimes used in filenames
  // - Comma (,) - sometimes used in filenames
  // - Apostrophe (') - sometimes used in filenames like "John's Document.pdf"
  if (!/^[a-zA-Z0-9\s\-_.%()[\]+&@#!,']+$/.test(sanitized)) {
    return { 
      valid: false, 
      error: `${fieldName} contains unsupported characters. Allowed: letters, numbers, spaces, and common filename characters (-_.%()[]+'&@#!,)` 
    };
  }
  
  return { valid: true, sanitized };
}

/**
 * Validate file path parameter
 * Prevents path traversal attacks, null bytes, and excessively long paths
 * @param value - Path to validate (can be empty for root directory)
 * @param fieldName - Name of the field for error messages
 * @returns Validation result with sanitized path
 */
export function validatePath(
  value: string | null | undefined,
  fieldName: string = 'Path'
): { valid: boolean; error?: string; sanitized?: string } {
  // Empty string is allowed (represents root directory)
  if (value === null || value === undefined) {
    return { valid: true, sanitized: "" };
  }

  // Must be a string
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  // Trim whitespace
  const sanitized = value.trim();

  // Check for null bytes - security risk
  if (sanitized.includes('\0') || sanitized.includes('%00')) {
    return { 
      valid: false, 
      error: `${fieldName} contains invalid null bytes` 
    };
  }

  // Check for path traversal attempts (../ or ..\)
  // This prevents accessing files outside intended directory
  if (sanitized.includes('..') || sanitized.includes('..\\')) {
    return { 
      valid: false, 
      error: `${fieldName} cannot contain parent directory references (..)` 
    };
  }

  // Azure has path length limits (260+ chars recommended)
  // Paths longer than this may exceed Azure Blob Storage limits
  const MAX_PATH_LENGTH = 260;
  if (sanitized.length > MAX_PATH_LENGTH) {
    return { 
      valid: false, 
      error: `${fieldName} must be ${MAX_PATH_LENGTH} characters or less (got ${sanitized.length})` 
    };
  }

  return { valid: true, sanitized };
}

/**
 * Validate Azure storage account name
 * Rules:
 * - 3-24 characters
 * - Lowercase letters and numbers only (can start with either)
 * - No hyphens, underscores, or uppercase characters
 * @param value - Storage account name to validate
 * @returns Validation result with error message if invalid
 */
export function validateStorageAccountName(
  value: string | null | undefined
): { valid: boolean; error?: string; sanitized?: string } {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'Storage account name is required' };
  }

  const sanitized = value.trim().toLowerCase();

  // Check for null bytes
  if (sanitized.includes('\0') || sanitized.includes('%00')) {
    return { valid: false, error: 'Storage account name contains invalid null bytes' };
  }

  // Length validation (Azure limit: 3-24 characters)
  if (sanitized.length < 3) {
    return { 
      valid: false, 
      error: 'Storage account name must be at least 3 characters' 
    };
  }

  if (sanitized.length > MAX_LENGTHS.STORAGE_ACCOUNT_NAME) {
    return { 
      valid: false, 
      error: `Storage account name must be ${MAX_LENGTHS.STORAGE_ACCOUNT_NAME} characters or less (got ${sanitized.length})` 
    };
  }

  // Only lowercase letters and numbers allowed (Azure requirement - can start with either)
  if (!/^[a-z0-9]+$/.test(sanitized)) {
    return { 
      valid: false, 
      error: 'Storage account name can only contain lowercase letters and numbers' 
    };
  }

  return { valid: true, sanitized };
}

/**
 * Create a strict boolean schema that rejects type coercion
 * Security: Prevents malicious boolean coercion like "true", 1, null becoming valid booleans
 * @param optional - Whether the field is optional (default: false)
 * @param defaultValue - Default value if optional (default: false)
 * @returns Zod schema that strictly validates booleans
 */
export function createStrictBooleanSchema(optional: boolean = false, defaultValue: boolean = false) {
  // Use superRefine to add custom validation that rejects type coercion
  let schema = z
    .boolean()
    .superRefine((val: any, ctx: any) => {
      // CRITICAL: Reject non-boolean types (prevent coercion)
      // Only true/false are valid, not "true", 1, null, undefined, etc.
      if (typeof val !== 'boolean') {
        ctx.addIssue({
          code: z.ZodIssueCode.invalid_type,
          expected: 'boolean',
          received: typeof val,
          message: `Expected boolean, received ${typeof val}. Strict type validation prevents coercion.`
        });
      }
    });

  // Apply optional/default if requested
  if (optional) {
    schema = schema.optional().default(defaultValue) as any;
  }

  return schema;
}

/**
 * Validate Azure container name
 * Rules:
 * - 3-63 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Cannot start or end with hyphen
 * - Cannot have consecutive hyphens
 * @param value - Container name to validate
 * @returns Validation result with error message if invalid
 */
export function validateContainerName(
  value: string | null | undefined
): { valid: boolean; error?: string; sanitized?: string } {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'Container name is required' };
  }

  const sanitized = value.trim().toLowerCase();

  // Check for null bytes
  if (sanitized.includes('\0') || sanitized.includes('%00')) {
    return { valid: false, error: 'Container name contains invalid null bytes' };
  }

  // Length validation (Azure limit: 3-63 characters)
  if (sanitized.length < 3) {
    return { 
      valid: false, 
      error: 'Container name must be at least 3 characters' 
    };
  }

  if (sanitized.length > MAX_LENGTHS.CONTAINER_NAME) {
    return { 
      valid: false, 
      error: `Container name must be ${MAX_LENGTHS.CONTAINER_NAME} characters or less (got ${sanitized.length})` 
    };
  }

  // Cannot start or end with hyphen
  if (sanitized.startsWith('-') || sanitized.endsWith('-')) {
    return { 
      valid: false, 
      error: 'Container name cannot start or end with a hyphen' 
    };
  }

  // Only lowercase letters, numbers, and hyphens allowed (Azure requirement)
  if (!/^[a-z0-9-]+$/.test(sanitized)) {
    return { 
      valid: false, 
      error: 'Container name can only contain lowercase letters, numbers, and hyphens' 
    };
  }

  // Cannot have consecutive hyphens (best practice)
  if (sanitized.includes('--')) {
    return { 
      valid: false, 
      error: 'Container name cannot contain consecutive hyphens' 
    };
  }

  return { valid: true, sanitized };
}

/**
 * Validate Azure Storage URL (SSRF Prevention)
 * Security: Only allow URLs from Azure Blob Storage or Data Lake Storage
 * Prevents Server-Side Request Forgery attacks on file preview endpoints
 * @param url - URL to validate
 * @returns true if valid Azure Storage URL, false otherwise
 */
export function validateAzureStorageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Only allow Azure Storage domains (blob.core.windows.net or dfs.core.windows.net)
    return (
      hostname.includes('.blob.core.windows.net') ||
      hostname.includes('.dfs.core.windows.net')
    );
  } catch {
    // Invalid URL format
    return false;
  }
}

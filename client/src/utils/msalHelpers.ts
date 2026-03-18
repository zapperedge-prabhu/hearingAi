import { AccountInfo } from "@azure/msal-browser";

/**
 * Helper function to extract user-friendly email from Azure AD account
 * This addresses the issue where login_hint shows GUID-based usernames
 */
export function getUserFriendlyEmail(account: AccountInfo): string {
  // Try to get email from various account properties
  let email = account.username;
  
  // If the account has idTokenClaims, check for actual email there
  if (account.idTokenClaims) {
    const claims = account.idTokenClaims as any;
    
    // Priority order: email, preferred_username, upn
    if (claims.email) {
      email = claims.email;
    } else if (claims.preferred_username && !claims.preferred_username.includes('@')) {
      // Only use preferred_username if it's not the GUID-based format
      email = claims.preferred_username;
    } else if (claims.upn) {
      email = claims.upn;
    }
  }
  
  // Handle external user format: username_domain.com#EXT#@tenant.onmicrosoft.com
  if (email && email.includes('#EXT#@')) {
    const externalPart = email.split('#EXT#@')[0];
    if (externalPart.includes('_')) {
      // Convert username_domain.com back to username@domain.com
      const lastUnderscore = externalPart.lastIndexOf('_');
      if (lastUnderscore > 0) {
        const username = externalPart.substring(0, lastUnderscore);
        const domain = externalPart.substring(lastUnderscore + 1);
        email = `${username}@${domain}`;
      }
    }
  }
  
  return email;
}

/**
 * Helper function to clear login hint from MSAL cache.
 * Removes any cached login_hint values that MSAL may have stored,
 * preventing Entra CIAM from forwarding them to federated IdPs (Google).
 */
export function clearLoginHintFromCache(): void {
  try {
    const stores = [localStorage, sessionStorage];
    for (const store of stores) {
      const msalKeys = Object.keys(store).filter(key =>
        key.includes('msal') && (key.includes('login') || key.includes('hint'))
      );

      msalKeys.forEach(key => {
        const value = store.getItem(key);
        if (value && value.includes('login_hint')) {
          console.log('[MSAL-HINT-CLEANUP] Clearing cached login hint from:', key);
          try {
            const parsed = JSON.parse(value);
            if (parsed.login_hint) {
              delete parsed.login_hint;
              store.setItem(key, JSON.stringify(parsed));
            }
          } catch {
            // non-JSON value, skip
          }
        }
      });
    }
  } catch (error) {
    console.log('[MSAL-HINT-CLEANUP] Error clearing login hints:', error);
  }
}
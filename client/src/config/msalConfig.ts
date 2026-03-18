import { Configuration, RedirectRequest, LogLevel } from "@azure/msal-browser";

const isProd = import.meta.env.PROD;

// Keep custom domain for better UX (avoid GUID tenants)
export const knownAuthorities = ["zapperedge.ciamlogin.com"];

export const msalConfig: Configuration = {
  auth: {
    clientId: "9a2c2b83-8b72-4729-8933-90f6b8002adf",
    authority: "https://zapperedge.ciamlogin.com/a80f8e72-4d76-43cb-a049-34e3a00f5821/v2.0",
    knownAuthorities,
    redirectUri: window.location.origin,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: true,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (isProd) return; // Turn off verbose logs in production
        if (level <= LogLevel.Warning) console.log("[MSAL]", message);
      },
      logLevel: isProd ? LogLevel.Error : LogLevel.Info,
      piiLoggingEnabled: false,
    },
  },
};

// Central helper to build login request
// IMPORTANT: Never set loginHint or login_hint — Entra CIAM maps it to the
// "username" parameter when federating to Google, and Google rejects that
// parameter with "Error 400: invalid_request".
export const createUserFriendlyLoginRequest = (
  _emailFromUI?: string,
  _domainHint?: string | null
): RedirectRequest => {
  const request: RedirectRequest = {
    scopes: ["openid", "profile", "email", "https://graph.microsoft.com/User.Read"],
    prompt: "login",
    loginHint: undefined,
    extraQueryParameters: {},
  };

  return request;
};

// Utility to clear any stale hints and interaction data MSAL may have stored.
// This prevents Entra CIAM from forwarding cached login_hint/username to Google
// federation, which causes "Error 400: invalid_request - Parameter not allowed
// for this message type: username".
export const clearLoginHints = () => {
  try {
    const stores = [localStorage, sessionStorage];
    for (const store of stores) {
      store.removeItem("msal.login.hint");
      const keys = Object.keys(store);
      for (const key of keys) {
        const lk = key.toLowerCase();
        if (lk.includes("msal") && (lk.includes("hint") || lk.includes("interaction") || lk.includes("request"))) {
          store.removeItem(key);
        }
      }
    }
  } catch {}
};

// Non-navigating cache clear: removes all MSAL-related entries from browser
// storage (localStorage + sessionStorage) and deactivates the active account.
// This ensures Entra CIAM has no cached username to inject to Google federation
// during the next loginRedirect. Unlike logoutRedirect, this does NOT navigate
// away from the page, so loginRedirect can be called immediately after.
export const clearMsalCache = (msalInstance: { setActiveAccount: (a: null) => void }) => {
  try {
    const stores = [localStorage, sessionStorage];
    for (const store of stores) {
      const keys = Object.keys(store);
      for (const key of keys) {
        if (key.startsWith("msal.") || key.includes(".msal-") || key.includes("msal")) {
          store.removeItem(key);
        }
      }
    }
    msalInstance.setActiveAccount(null);
    console.log('[MSAL] Cache cleared (non-navigating)');
  } catch (e) {
    console.error('[MSAL] Failed to clear cache:', e);
  }
};

// Legacy export for compatibility
export const loginRequest: RedirectRequest = createUserFriendlyLoginRequest();
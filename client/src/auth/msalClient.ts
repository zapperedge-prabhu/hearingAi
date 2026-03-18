import { PublicClientApplication, LogLevel, type Configuration } from "@azure/msal-browser";
import type { RuntimeConfig } from "../runtimeConfig";

const mapLogLevel = (level: string): LogLevel => {
  switch (level) {
    case "Error": return LogLevel.Error;
    case "Warning": return LogLevel.Warning;
    case "Verbose": return LogLevel.Verbose;
    case "Info":
    default: return LogLevel.Info;
  }
};

export function createMsalInstance(rc: RuntimeConfig): PublicClientApplication {
  // Runtime validation of configuration
  const validCacheLocations = ["localStorage", "sessionStorage"];
  if (!validCacheLocations.includes(rc.msal.cache.cacheLocation)) {
    throw new Error(`Invalid cacheLocation '${rc.msal.cache.cacheLocation}'. MSAL only supports: ${validCacheLocations.join(", ")}`);
  }

  const conf: Configuration = {
    auth: {
      clientId: rc.msal.auth.clientId,
      authority: rc.msal.auth.authority,
      knownAuthorities: rc.msal.auth.knownAuthorities,
      redirectUri: rc.msal.auth.redirectUri || window.location.origin,
      navigateToLoginRequestUrl: rc.msal.auth.navigateToLoginRequestUrl
    },
    cache: rc.msal.cache,
    system: {
      loggerOptions: {
        logLevel: mapLogLevel(rc.msal.system.logLevel),
        piiLoggingEnabled: false,
        loggerCallback: (level, message) => {
          if (rc.meta.env === "production") return;
          if (level <= LogLevel.Warning) console.log("[MSAL]", message);
          if (message.includes("login_hint") || message.includes("loginHint") || message.includes("domain_hint")) {
            console.warn("[MSAL-HINT-TRACE]", message);
          }
        },
      },
    },
  };

  return new PublicClientApplication(conf);
}
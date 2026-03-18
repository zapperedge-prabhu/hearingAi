import { Router } from "express";

const configRouter = Router();

configRouter.get("/", (req, res) => {
  try {
    // Get required environment variables
    let clientId = process.env.ZAPPER_MSAL_CLIENT_ID;
    let authority = process.env.ZAPPER_MSAL_AUTHORITY;
    
    // In development mode, provide mock configuration if not set
    const isDevelopment = process.env.NODE_ENV === "development";
    if (!clientId || !authority) {
      if (isDevelopment) {
        // Mock MSAL configuration for development
        clientId = clientId || "mock-client-id-dev";
        authority = authority || "https://login.microsoftonline.com/mock-tenant-id";
      } else {
        return res.status(500).json({
          error: "Missing required MSAL configuration",
          missing: {
            clientId: !clientId,
            authority: !authority
          }
        });
      }
    }

    // Get optional environment variables with defaults
    const knownAuthorities = process.env.ZAPPER_MSAL_KNOWN_AUTHORITIES?.split(",") || ["zapperedge.ciamlogin.com"];
    const redirectUri = process.env.ZAPPER_REDIRECT_URI || null;
    const cacheLocation = process.env.ZAPPER_MSAL_CACHE_LOCATION || "sessionStorage";
    const storeAuthStateInCookie = process.env.ZAPPER_MSAL_STORE_AUTHSTATE_COOKIE === "true";
    const logLevel = process.env.ZAPPER_MSAL_LOGLEVEL || "Error";
    const domainHint = process.env.ZAPPER_DOMAIN_HINT || null;

    // Activity Logging Controls
    const logGeoAccess = process.env.ZAPPER_LOG_GEO_ACCESS || "true";
    const logUpdateGeoFencing = process.env.ZAPPER_LOG_UPDATE_GEO_FENCING || "true";
    const logViewInventory = process.env.ZAPPER_LOG_VIEW_INVENTORY || "true";
    const logConfigureInventory = process.env.ZAPPER_LOG_CONFIGURE_INVENTORY || "true";

    // Validate cache location
    const validCacheLocations = ["localStorage", "sessionStorage"];
    if (!validCacheLocations.includes(cacheLocation)) {
      throw new Error(`Invalid ZAPPER_MSAL_CACHE_LOCATION. Must be one of: ${validCacheLocations.join(", ")}`);
    }

    const config = {
      msal: {
        auth: {
          clientId,
          authority,
          knownAuthorities,
          redirectUri,
          navigateToLoginRequestUrl: false
        },
        cache: {
          cacheLocation: cacheLocation as "localStorage" | "sessionStorage",
          storeAuthStateInCookie
        },
        system: {
          logLevel
        }
      },
      logging: {
        geoAccess: logGeoAccess === "true",
        updateGeoFencing: logUpdateGeoFencing === "true",
        viewInventory: logViewInventory === "true",
        configureInventory: logConfigureInventory === "true"
      },
      login: {
        domainHint // can be null
      },
      meta: {
        env: process.env.NODE_ENV || "development",
        generatedAt: new Date().toISOString()
      }
    };

    // Set no-cache headers
    res.setHeader("Cache-Control", "no-store");
    res.json(config);
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate MSAL configuration",
      details: String(error)
    });
  }
});

// Upload configuration endpoint - exposes upload limits from environment variables
configRouter.get("/upload", (req, res) => {
  try {
    // Read upload limits from environment variables with proper validation
    const MAX_FILES_COUNT = (() => {
      const parsed = parseInt(process.env.ZAPPER_MAX_FILES_COUNT || "1000");
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
    })();
    
    const MAX_UPLOAD_SIZE_GB = (() => {
      const parsed = parseInt(process.env.ZAPPER_MAX_UPLOAD_SIZE || "15");
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
    })();

    const CHUNK_SIZE_MB = (() => {
      const parsed = parseInt(process.env.ZAPPER_CHUNK_SIZE_MB || "4");
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
    })();

    const UPLOAD_CONCURRENCY = (() => {
      const parsed = parseInt(process.env.ZAPPER_UPLOAD_CONCURRENCY || "5");
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
    })();

    const MAX_RETRIES = (() => {
      const parsed = parseInt(process.env.ZAPPER_MAX_RETRIES || "3");
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
    })();

    const VIDEO_MAX_POLLS = (() => {
      const parsed = parseInt(process.env.ZAPPER_CU_VIDEO_MAX_POLLS || "2880");
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 2880;
    })();

    const FILE_UPLOAD_MODE = process.env.ZAPPER_FILE_UPLOAD_MODE || "sas";
    const MEMORY_UPLOAD_LIMIT_MB = (() => {
      const parsed = parseInt(process.env.ZAPPER_MEMORY_UPLOAD_LIMIT_MB || "100");
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
    })();

    const config = {
      fileUploadMode: FILE_UPLOAD_MODE,
      memoryUploadLimitMB: MEMORY_UPLOAD_LIMIT_MB,
      sasTimeoutMinutes: 60,
      chunkSizeMB: CHUNK_SIZE_MB,
      uploadConcurrency: UPLOAD_CONCURRENCY,
      maxRetries: MAX_RETRIES,
      videoMaxPolls: VIDEO_MAX_POLLS,
      chunkSizeBytes: CHUNK_SIZE_MB * 1024 * 1024,
      maxFilesCount: MAX_FILES_COUNT,
      maxUploadSizeGB: MAX_UPLOAD_SIZE_GB,
      maxUploadSizeBytes: MAX_UPLOAD_SIZE_GB * 1024 * 1024 * 1024,
    };

    // Set no-cache headers to ensure fresh config on each request
    res.setHeader("Cache-Control", "no-store");
    res.json(config);
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate upload configuration",
      details: String(error)
    });
  }
});

export default configRouter;
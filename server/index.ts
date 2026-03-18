// zapper-mft/server/index.ts
import dotenv from "dotenv";
import "dotenv/config";
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ⬇️ NEW: ensure DATABASE_URL is set before db.ts is loaded
import { getDatabaseUrl } from "./config/dbUrl";

const log = (msg: string) => console.log(msg);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  // If ZAPPER_USE_KEYVAULT=true, fetch from KV and set into env for db.ts
  if (String(process.env.ZAPPER_USE_KEYVAULT || "false").toLowerCase() === "true") {
    const url = await getDatabaseUrl();
    process.env.DATABASE_URL = url; // <- ensure db.ts sees it
  } else {
    // Validate local env for clarity
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must be set when ZAPPER_USE_KEYVAULT=false.");
    }
  }

  // ⬇️ Import AFTER DATABASE_URL is guaranteed
  const { pool, initializeDatabase } = await import("./db");
  await initializeDatabase();

  const app = express();

  // Enable trust proxy to get real client IP from X-Forwarded-For header
  // This is essential when running behind reverse proxies/load balancers
  app.set('trust proxy', true);

  // Security headers via Helmet - minimal config to avoid breaking UI
  const isProduction = process.env.NODE_ENV === "production";
  app.use(helmet({
    // Disable CSP in dev (breaks Vite HMR), enable in prod
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https:", "wss:"],
        frameSrc: ["'self'", "https://login.microsoftonline.com", "https://*.blob.core.windows.net"],
        mediaSrc: ["'self'", "https://*.blob.core.windows.net"],
        objectSrc: ["'none'"],
      },
    } : false,
    // Allow cross-origin resources (Azure blobs, external APIs)
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));

  if (!process.env.ZAPPER_JWT_SECRET) {
    throw new Error("ZAPPER_JWT_SECRET must be set securely in production.");
  }

  const PgSession = ConnectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: process.env.ZAPPER_JWT_SECRET as string,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',
      },
    })
  );

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false, limit: "10mb" }));

  // Serve attached_assets folder as static content for Help images
  app.use('/assets', express.static(path.resolve(__dirname, '..', 'attached_assets')));

  // Simple API log
  app.use((req, res, next) => {
    const start = Date.now();
    const pathUrl = req.path;
    let payload: any;

    const origJson = res.json;
    res.json = function (body: any, ...args: any[]) {
      payload = body;
      // @ts-ignore
      return origJson.apply(this, [body, ...args]);
    };

    res.on("finish", () => {
      if (pathUrl.startsWith("/api")) {
        let line = `${req.method} ${pathUrl} ${res.statusCode} in ${Date.now() - start}ms`;
        if (payload) {
          line += ` :: ${JSON.stringify(payload)}`;
        }
        if (line.length > 80) line = line.slice(0, 79) + "…";
        log(line);
      }
    });

    next();
  });

  // (keep your existing logging middleware + routes bootstrap exactly as before)
  const { registerRoutes } = await import("./routes");
  const server = await registerRoutes(app);

  // Setup Vite/static serving before error handler
  if (app.get("env") === "development") {
      // ⬇️ Load Vite only in dev so it never appears in prod bundle
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
    
    // Serve index.html for all non-API routes
    app.use("*", async (req, res, next) => {
      // Skip API routes - they should be handled by Express routes
      if (req.originalUrl.startsWith("/api")) {
        return next();
      }
      try {
        const clientTemplate = path.resolve(__dirname, "..", "client", "index.html");
        let template = await import("fs/promises").then(fs => fs.readFile(clientTemplate, "utf-8"));
        const page = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(page);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // ⬇️ Pure Express static serving in prod (no ./vite import at all)
    const publicDir = path.resolve(__dirname, "public"); // dist/public
    app.use(express.static(publicDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  // Error handler must come after all routes and middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Error occurred:", err);
    res.status(status).json({ message });
  });

  const port = Number(process.env.PORT || 5000);
  server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);

    const fileUploadMode = process.env.ZAPPER_FILE_UPLOAD_MODE || "memory";
    console.log(`📁 ZAPPER_FILE_UPLOAD_MODE: ${fileUploadMode}`);
    if (fileUploadMode === "memory") {
      console.log(`📁 ZAPPER_MEMORY_UPLOAD_LIMIT_MB: ${process.env.ZAPPER_MEMORY_UPLOAD_LIMIT_MB || "100"}`);
    } else if (fileUploadMode === "disk") {
      const uploadDir = process.env.ZAPPER_UPLOAD_DIR || (process.platform === "win32" ? "./uploads" : "/tmp/uploads");
      console.log(`📁 ZAPPER_UPLOAD_DIR: ${uploadDir}`);
    } else if (fileUploadMode === "sas") {
      console.log(`📁 ZAPPER_SAS_TIMEOUT_MINUTES: ${process.env.ZAPPER_SAS_TIMEOUT_MINUTES || "15"}`);
      console.log(`📁 ZAPPER_CHUNK_SIZE_MB: ${process.env.ZAPPER_CHUNK_SIZE_MB || "4"}`);
      console.log(`📁 ZAPPER_UPLOAD_CONCURRENCY: ${process.env.ZAPPER_UPLOAD_CONCURRENCY || "5"}`);
      console.log(`📁 ZAPPER_MAX_RETRIES: ${process.env.ZAPPER_MAX_RETRIES || "3"}`);
    }

    console.log(`📏 ZAPPER_ZIP_STRATEGY_THRESHOLD_MB: ${process.env.ZAPPER_ZIP_STRATEGY_THRESHOLD_MB || "100"}`);
    console.log(`📦 ZAPPER_USE_ACA_FOR_DOWNLOADS: ${process.env.ZAPPER_USE_ACA_FOR_DOWNLOADS || "false"}`);
    console.log(`🔐 ZAPPER_DECRYPT_RESULTS_DIR: ${process.env.ZAPPER_DECRYPT_RESULTS_DIR || "decrypted"}`);
    console.log(`🤖 ZAPPER_AIAGENT_RESULTS_DIR: ${process.env.ZAPPER_AIAGENT_RESULTS_DIR || "aiagent_results"}`);
    console.log(`🔍 ZAPPER_CU_RESULTS_DIR: ${process.env.ZAPPER_CU_RESULTS_DIR || "cu_folder"}`);
    
    // Activity Logging Configuration
    console.log(`\n📝 === ACTIVITY LOGGING CONFIGURATION ===`);
    console.log(`📝 # FILE MANAGEMENT ACTIVITY LOGS`);
    console.log(`📝 ZAPPER_LOG_UPLOAD_FILE: ${process.env.ZAPPER_LOG_UPLOAD_FILE || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_DOWNLOAD_FILE: ${process.env.ZAPPER_LOG_DOWNLOAD_FILE || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_DELETE_FILE: ${process.env.ZAPPER_LOG_DELETE_FILE || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_CREATE_DIRECTORY: ${process.env.ZAPPER_LOG_CREATE_DIRECTORY || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_VIEW_FILES: ${process.env.ZAPPER_LOG_VIEW_FILES || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_REHYDRATE_FILE: ${process.env.ZAPPER_LOG_REHYDRATE_FILE || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_SEARCH_FILES: ${process.env.ZAPPER_LOG_SEARCH_FILES || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 # PGP KEY MANAGEMENT ACTIVITY LOGS`);
    console.log(`📝 ZAPPER_LOG_PGP_KEY_GENERATE: ${process.env.ZAPPER_LOG_PGP_KEY_GENERATE || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_PGP_KEY_IMPORT: ${process.env.ZAPPER_LOG_PGP_KEY_IMPORT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_PGP_KEY_DELETE: ${process.env.ZAPPER_LOG_PGP_KEY_DELETE || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_VIEW_PGP_KEYS: ${process.env.ZAPPER_LOG_VIEW_PGP_KEYS || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 # PGP ENCRYPTION/DECRYPTION ACTIVITY LOGS`);
    console.log(`📝 ZAPPER_LOG_FILE_ENCRYPT: ${process.env.ZAPPER_LOG_FILE_ENCRYPT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_FILE_DECRYPT: ${process.env.ZAPPER_LOG_FILE_DECRYPT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_FILE_DECRYPT_FAILED: ${process.env.ZAPPER_LOG_FILE_DECRYPT_FAILED || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_FILE_ENCRYPT_FAILED: ${process.env.ZAPPER_LOG_FILE_ENCRYPT_FAILED || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 # FOUNDRY AI ACTIVITY LOGS`);
    console.log(`📝 ZAPPER_LOG_CREATE_FOUNDRY_RESOURCE: ${process.env.ZAPPER_LOG_CREATE_FOUNDRY_RESOURCE || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_UPDATE_FOUNDRY_RESOURCE: ${process.env.ZAPPER_LOG_UPDATE_FOUNDRY_RESOURCE || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_DELETE_FOUNDRY_RESOURCE: ${process.env.ZAPPER_LOG_DELETE_FOUNDRY_RESOURCE || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_VIEW_FOUNDRY_RESOURCES: ${process.env.ZAPPER_LOG_VIEW_FOUNDRY_RESOURCES || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_CREATE_FOUNDRY_RESOURCE_SET: ${process.env.ZAPPER_LOG_CREATE_FOUNDRY_RESOURCE_SET || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_UPDATE_FOUNDRY_RESOURCE_SET: ${process.env.ZAPPER_LOG_UPDATE_FOUNDRY_RESOURCE_SET || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_DELETE_FOUNDRY_RESOURCE_SET: ${process.env.ZAPPER_LOG_DELETE_FOUNDRY_RESOURCE_SET || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_VIEW_FOUNDRY_RESOURCE_SETS: ${process.env.ZAPPER_LOG_VIEW_FOUNDRY_RESOURCE_SETS || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_CREATE_FOUNDRY_HUB: ${process.env.ZAPPER_LOG_CREATE_FOUNDRY_HUB || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_DELETE_FOUNDRY_HUB: ${process.env.ZAPPER_LOG_DELETE_FOUNDRY_HUB || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_CREATE_FOUNDRY_PROJECT: ${process.env.ZAPPER_LOG_CREATE_FOUNDRY_PROJECT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_DELETE_FOUNDRY_PROJECT: ${process.env.ZAPPER_LOG_DELETE_FOUNDRY_PROJECT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_CREATE_FOUNDRY_DEPLOYMENT: ${process.env.ZAPPER_LOG_CREATE_FOUNDRY_DEPLOYMENT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_DELETE_FOUNDRY_DEPLOYMENT: ${process.env.ZAPPER_LOG_DELETE_FOUNDRY_DEPLOYMENT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_CREATE_FOUNDRY_AGENT: ${process.env.ZAPPER_LOG_CREATE_FOUNDRY_AGENT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_UPDATE_FOUNDRY_AGENT: ${process.env.ZAPPER_LOG_UPDATE_FOUNDRY_AGENT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_DELETE_FOUNDRY_AGENT: ${process.env.ZAPPER_LOG_DELETE_FOUNDRY_AGENT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_CREATE_FOUNDRY_VECTOR_STORE: ${process.env.ZAPPER_LOG_CREATE_FOUNDRY_VECTOR_STORE || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_DELETE_FOUNDRY_VECTOR_STORE: ${process.env.ZAPPER_LOG_DELETE_FOUNDRY_VECTOR_STORE || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_FOUNDRY_CHAT: ${process.env.ZAPPER_LOG_FOUNDRY_CHAT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_FOUNDRY_FILE_IMPORT: ${process.env.ZAPPER_LOG_FOUNDRY_FILE_IMPORT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 # CONTENT UNDERSTANDING ACTIVITY LOGS`);
    console.log(`📝 ZAPPER_LOG_RUN_CONTENT_ANALYSIS: ${process.env.ZAPPER_LOG_RUN_CONTENT_ANALYSIS || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_SAVE_CU_RESULT: ${process.env.ZAPPER_LOG_SAVE_CU_RESULT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_DELETE_CU_RESULT: ${process.env.ZAPPER_LOG_DELETE_CU_RESULT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_VIEW_CU_RESULTS: ${process.env.ZAPPER_LOG_VIEW_CU_RESULTS || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_TRANSLATE_DOCUMENT: ${process.env.ZAPPER_LOG_TRANSLATE_DOCUMENT || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 # EVAL (EXAM GRADING) ACTIVITY LOGS`);
    console.log(`📝 ZAPPER_LOG_START_EVAL_JOB: ${process.env.ZAPPER_LOG_START_EVAL_JOB || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_START_EVAL_BATCH: ${process.env.ZAPPER_LOG_START_EVAL_BATCH || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_VIEW_EVAL_JOBS: ${process.env.ZAPPER_LOG_VIEW_EVAL_JOBS || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_VIEW_EVAL_JOB: ${process.env.ZAPPER_LOG_VIEW_EVAL_JOB || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_REVIEW_EVAL_JOB: ${process.env.ZAPPER_LOG_REVIEW_EVAL_JOB || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_FINALIZE_EVAL_JOB: ${process.env.ZAPPER_LOG_FINALIZE_EVAL_JOB || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_UPDATE_EVAL_QUESTION_REVIEWS: ${process.env.ZAPPER_LOG_UPDATE_EVAL_QUESTION_REVIEWS || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_VIEW_EVAL_REVIEW_HISTORY: ${process.env.ZAPPER_LOG_VIEW_EVAL_REVIEW_HISTORY || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_START_EVAL_BATCH_ANALYSIS: ${process.env.ZAPPER_LOG_START_EVAL_BATCH_ANALYSIS || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 ZAPPER_LOG_VIEW_EVAL_BATCH_ANALYSIS: ${process.env.ZAPPER_LOG_VIEW_EVAL_BATCH_ANALYSIS || 'NOT_SET (defaults to ENABLED)'}`);
    console.log(`📝 === END ACTIVITY LOGGING CONFIGURATION ===\n`);
  });

  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully");
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });
}

// start
bootstrap().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});

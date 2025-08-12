/**
 * HTTPS server for handling OAuth2 authentication flow
 * Provides secure authentication endpoints and serves static files
 */

import express from "express";
import path from "path";
import https from "https";
import fs from "fs";

import { config } from "./config/index.js";
import { createLogger } from "./utils/logger.js";
import {
  writeFileContent,
  ensureDirectoryExists,
  FileSystemError,
} from "./utils/fileUtils.js";

// Initialize logger
const logger = createLogger(
  path.join(import.meta.dirname, "..", "logs"),
  config.logging.level,
  config.logging.maxLogSize
);

const app = express();

// Basic CORS handling without external dependency
app.use((req, res, next) => {
  const allowedOrigins = config.security.allowedOrigins;
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }

  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("HTTP request completed", {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      userAgent: req.get("User-Agent"),
      ip: req.ip,
    });
  });

  next();
});

// Load SSL certificates with error handling
let sslOptions: https.ServerOptions;
try {
  sslOptions = {
    key: fs.readFileSync(
      path.join(import.meta.dirname, "..", "certs", "key.pem")
    ),
    cert: fs.readFileSync(
      path.join(import.meta.dirname, "..", "certs", "cert.pem")
    ),
  };
  logger.info("SSL certificates loaded successfully");
} catch (error) {
  logger.error("Failed to load SSL certificates", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}

// Serve static files
app.use(express.static(path.join(import.meta.dirname, "..", "dist")));

/**
 * Root endpoint - redirect to login page
 */
app.get("/", (req, res) => {
  logger.info("Root endpoint accessed, redirecting to login");
  res.redirect("/login.html");
});

/**
 * OAuth2 callback endpoint
 * Handles the authentication callback and stores the token securely
 */
app.post("/callback", async (req, res) => {
  try {
    logger.info("OAuth2 callback received");

    // Validate request body
    if (!req.body || typeof req.body !== "object") {
      logger.warn("Invalid callback request body");
      return res.status(400).json({
        error: "Invalid request body",
      });
    }

    // Sanitize sensitive data for logging
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.token) {
      sanitizedBody.token = `${sanitizedBody.token.substring(0, 10)}...`;
    }

    logger.info("Processing authentication callback", { data: sanitizedBody });

    // Ensure callback directory exists
    const callbackDir = path.join(import.meta.dirname, "..", "dist");
    await ensureDirectoryExists(callbackDir);

    // Write callback data securely
    const callbackPath = path.join(callbackDir, "callback.json");
    await writeFileContent(callbackPath, JSON.stringify(req.body, null, 2), {
      maxSize: config.security.maxFileSize,
    });

    logger.info("Authentication callback processed successfully");

    res.json({
      message: "Authentication successful!",
      timestamp: new Date().toISOString(),
    });

    // Graceful shutdown after successful authentication
    setTimeout(() => {
      logger.info("Shutting down server after successful authentication");
      process.exit(0);
    }, 3000);
  } catch (error) {
    if (error instanceof FileSystemError) {
      logger.error("File system error in callback", {
        error: error.message,
        code: error.code,
        path: error.path,
      });
      return res.status(500).json({
        error: "Failed to save authentication data",
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error processing authentication callback", {
      error: errorMessage,
    });

    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// Error handling middleware
app.use(
  (
    error: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error("Unhandled error in Express app", {
      error: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
    });

    res.status(500).json({
      error: "Internal server error",
    });
  }
);

// 404 handler
app.use((req, res) => {
  logger.warn("404 - Route not found", {
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  res.status(404).json({
    error: "Route not found",
  });
});

/**
 * Start the HTTPS server
 */
function startServer(): void {
  const server = https.createServer(sslOptions, app);

  server.listen(config.port, () => {
    logger.info("HTTPS server started", {
      port: config.port,
      environment: process.env.NODE_ENV || "development",
    });
  });

  server.on("error", (error: Error) => {
    logger.error("Server error", { error: error.message });
    process.exit(1);
  });

  // Graceful shutdown handling
  const gracefulShutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);

    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });

    // Force close after timeout
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

// Start the server
startServer();

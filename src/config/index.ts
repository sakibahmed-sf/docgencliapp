/**
 * Configuration management for DocGen CLI App
 * Centralizes all configuration values and provides runtime validation
 */

import { z } from "zod";

// Configuration schema for runtime validation
export const ConfigSchema = z.object({
  port: z.number().min(1).max(65535).default(3000),
  apiBase: z
    .string()
    .url()
    .default("https://us-wordaddinbff.sharefiletest.io/io/docgen"),
  authority: z.object({
    uri: z.string().url().default("https://auth.sharefiletest.io"),
    clientId: z.string().default("ShareFileWordAddInClient"),
    scope: z.string().default("wordaddinbff:api.full"),
  }),
  security: z.object({
    maxFileSize: z.number().default(10 * 1024 * 1024), // 10MB
    requestTimeout: z.number().default(30000), // 30 seconds
    allowedOrigins: z.array(z.string()).default(["https://localhost:3000"]),
  }),
  logging: z.object({
    level: z.enum(["error", "warn", "info", "debug"]).default("info"),
    maxLogSize: z.number().default(100 * 1024 * 1024), // 100MB
  }),
  ollama: z.object({
    url: z.string().url().default("http://localhost:11434"),
    model: z.string().default("qwen2.5"),
    timeout: z.number().default(60000), // 60 seconds
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * Loads and validates configuration from environment variables
 * @returns Validated configuration object
 * @throws Error if configuration is invalid
 */
export function loadConfig(): AppConfig {
  const rawConfig = {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    apiBase: process.env.API_BASE,
    authority: {
      uri: process.env.AUTH_URI,
      clientId: process.env.CLIENT_ID,
      scope: process.env.SCOPE,
    },
    security: {
      maxFileSize: process.env.MAX_FILE_SIZE
        ? parseInt(process.env.MAX_FILE_SIZE, 10)
        : undefined,
      requestTimeout: process.env.REQUEST_TIMEOUT
        ? parseInt(process.env.REQUEST_TIMEOUT, 10)
        : undefined,
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || undefined,
    },
    logging: {
      level: process.env.LOG_LEVEL as any,
      maxLogSize: process.env.MAX_LOG_SIZE
        ? parseInt(process.env.MAX_LOG_SIZE, 10)
        : undefined,
    },
    ollama: {
      url: process.env.OLLAMA_URL,
      model: process.env.OLLAMA_MODEL,
      timeout: process.env.OLLAMA_TIMEOUT
        ? parseInt(process.env.OLLAMA_TIMEOUT, 10)
        : undefined,
    },
  };

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join(".")}: ${err.message}`
      );
      throw new Error(
        `Configuration validation failed:\n${errorMessages.join("\n")}`
      );
    }
    throw error;
  }
}

// Global configuration instance
export const config = loadConfig();

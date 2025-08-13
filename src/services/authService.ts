/**
 * Authentication Service
 * Handles token management and validation
 */

import { jwtDecode } from "jwt-decode";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import {
  TokenPayload,
  TokenPayloadSchema,
  ServiceResult,
  AppError,
} from "../types/index.js";
import { readFileContent, FileSystemError } from "../utils/fileUtils.js";
import { config } from "../config/index.js";
import { Logger } from "../utils/logger.js";

export class AuthService {
  private token: string | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Retrieves the authentication token from the callback file
   */
  async getToken(): Promise<ServiceResult<string>> {
    try {
      if (this.token && this.isTokenValid(this.token)) {
        return { success: true, data: this.token };
      }

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const filePath = join(__dirname, "..", "..", "dist", "callback.json");

      this.logger.debug("Reading token from callback file", { filePath });

      const content = await readFileContent(filePath, {
        maxSize: config.security.maxFileSize,
        allowedExtensions: [".json"],
      });

      const json = JSON.parse(content);

      if (!json.token || typeof json.token !== "string") {
        throw new Error("Invalid token format in callback file");
      }

      // Validate token structure (basic JWT validation)
      const tokenParts = json.token.split(".");
      if (tokenParts.length !== 3) {
        throw new Error("Invalid JWT token format");
      }

      this.token = json.token;
      this.logger.info("Token retrieved successfully");

      return { success: true, data: this.token! };
    } catch (error) {
      const appError: AppError = {
        code:
          error instanceof FileSystemError
            ? "TOKEN_FILE_ERROR"
            : "TOKEN_VALIDATION_ERROR",
        message: error instanceof Error ? error.message : String(error),
        context: { filePath: "callback.json" },
      };

      this.logger.error("Failed to retrieve token", { error: appError });

      return { success: false, error: appError };
    }
  }

  /**
   * Validates if a JWT token is still valid
   */
  isTokenValid(token: string): boolean {
    try {
      const decoded = jwtDecode<TokenPayload>(token);
      const now = Date.now() / 1000;

      // Check if token has expiration and if it's still valid
      if (decoded.exp && decoded.exp <= now) {
        this.logger.warn("Token has expired", {
          expiry: new Date(decoded.exp * 1000).toISOString(),
          now: new Date(now * 1000).toISOString(),
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error("Token validation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Decodes and validates token payload
   */
  decodeToken(token: string): ServiceResult<TokenPayload> {
    try {
      const decoded = jwtDecode<TokenPayload>(token);
      const validatedPayload = TokenPayloadSchema.parse(decoded);

      return { success: true, data: validatedPayload };
    } catch (error) {
      const appError: AppError = {
        code: "TOKEN_DECODE_ERROR",
        message: error instanceof Error ? error.message : String(error),
      };

      return { success: false, error: appError };
    }
  }

  /**
   * Clear stored token
   */
  clearToken(): void {
    this.token = null;
  }
}

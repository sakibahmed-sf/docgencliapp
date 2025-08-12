/**
 * Enhanced HTTP client with security features and error handling
 */

import { config } from "../config/index.js";
import { Logger } from "./logger.js";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string | object;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface ApiResponse<T = any> {
  data: T | null;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  success: boolean;
  error?: string;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string,
    public readonly response?: any
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * Enhanced HTTP client with built-in security and error handling
 */
export class HttpClient {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Validate URL to prevent SSRF attacks
   */
  private validateUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);

      // Only allow HTTPS in production
      if (
        process.env.NODE_ENV === "production" &&
        parsedUrl.protocol !== "https:"
      ) {
        throw new Error("Only HTTPS URLs are allowed in production");
      }

      // Prevent requests to localhost/private IPs in production
      if (process.env.NODE_ENV === "production") {
        const hostname = parsedUrl.hostname.toLowerCase();
        const privateRanges = [
          "127.0.0.1",
          "localhost",
          "0.0.0.0",
          "10.",
          "172.16.",
          "172.17.",
          "172.18.",
          "172.19.",
          "172.20.",
          "172.21.",
          "172.22.",
          "172.23.",
          "172.24.",
          "172.25.",
          "172.26.",
          "172.27.",
          "172.28.",
          "172.29.",
          "172.30.",
          "172.31.",
          "192.168.",
        ];

        if (privateRanges.some((range) => hostname.startsWith(range))) {
          throw new Error(
            "Requests to private IP ranges are not allowed in production"
          );
        }
      }
    } catch (error) {
      throw new NetworkError(
        `Invalid URL: ${url} - ${
          error instanceof Error ? error.message : String(error)
        }`,
        url,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Validate and sanitize token
   */
  private validateToken(token: string): string {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid token: must be a non-empty string");
    }

    // Remove any potential injection characters
    const sanitizedToken = token.replace(/[\\r\\n\\t]/g, "");

    if (sanitizedToken.length < 10) {
      throw new Error("Invalid token: too short");
    }

    return sanitizedToken;
  }

  /**
   * Prepare headers with security considerations
   */
  private prepareHeaders(
    token?: string,
    additionalHeaders?: Record<string, string>
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "DocGen-CLI/1.0.0",
      ...additionalHeaders,
    };

    if (token) {
      const validatedToken = this.validateToken(token);
      headers["Authorization"] = `Bearer ${validatedToken}`;
    }

    return headers;
  }

  /**
   * Sleep for retry delay
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Make HTTP request with enhanced error handling and security
   */
  async request<T = any>(
    url: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = "GET",
      headers: additionalHeaders,
      body,
      timeout = config.security.requestTimeout,
      retries = 3,
      retryDelay = 1000,
    } = options;

    this.validateUrl(url);

    const headers = this.prepareHeaders(undefined, additionalHeaders);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.logger.debug(`HTTP ${method} request to ${url}`, {
          attempt: attempt + 1,
          maxAttempts: retries + 1,
          timeout,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const requestBody = body
          ? typeof body === "string"
            ? body
            : JSON.stringify(body)
          : undefined;

        const response = await fetch(url, {
          method,
          headers,
          body: requestBody,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        let responseData: T | null = null;
        let responseText = "";

        try {
          responseText = await response.text();
          responseData = responseText ? JSON.parse(responseText) : null;
        } catch (parseError) {
          // If JSON parsing fails, treat as plain text
          responseData = responseText as any;
        }

        const apiResponse: ApiResponse<T> = {
          data: responseData,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          success: response.ok,
        };

        if (!response.ok) {
          const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          apiResponse.error = errorMessage;

          this.logger.error("HTTP request failed", {
            url,
            method,
            status: response.status,
            statusText: response.statusText,
            responseData,
          });

          throw new HttpError(
            errorMessage,
            response.status,
            response.statusText,
            url,
            responseData
          );
        }

        this.logger.info("HTTP request successful", {
          url,
          method,
          status: response.status,
          attempt: attempt + 1,
        });

        return apiResponse;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof HttpError) {
          // Don't retry client errors (4xx), only server errors (5xx) and network errors
          if (error.status >= 400 && error.status < 500) {
            throw error;
          }
        }

        if (attempt < retries) {
          this.logger.warn(`HTTP request failed, retrying in ${retryDelay}ms`, {
            url,
            method,
            attempt: attempt + 1,
            maxAttempts: retries + 1,
            error: lastError.message,
          });

          await this.sleep(retryDelay * (attempt + 1)); // Exponential backoff
        }
      }
    }

    throw new NetworkError(
      `Request failed after ${retries + 1} attempts: ${
        lastError?.message || "Unknown error"
      }`,
      url,
      lastError || undefined
    );
  }

  /**
   * Convenience method for authenticated requests
   */
  async authenticatedRequest<T = any>(
    url: string,
    token: string,
    options: Omit<RequestOptions, "headers"> & {
      headers?: Record<string, string>;
    } = {}
  ): Promise<ApiResponse<T>> {
    const validatedToken = this.validateToken(token);
    const headers = this.prepareHeaders(validatedToken, options.headers);

    return this.request<T>(url, {
      ...options,
      headers,
    });
  }
}

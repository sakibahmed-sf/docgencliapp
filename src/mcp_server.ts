#!/usr/bin/env node

/**
 * DocGen MCP Server
 * Provides tools for interacting with DocGen APIs through the Model Context Protocol
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join } from "path";

import { config } from "./config/index.js";
import { createLogger, Logger } from "./utils/logger.js";
import { HttpClient, HttpError, NetworkError } from "./utils/httpClient.js";

// Initialize logger
const logger = createLogger(
  join(fileURLToPath(import.meta.url), "..", "..", "logs"),
  config.logging.level,
  config.logging.maxLogSize
);

// Initialize HTTP client
const httpClient = new HttpClient(logger);

/**
 * DocGen template schema for validation
 */
const DocGenTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

/**
 * DocGen data source schema for validation
 */
const DocGenDataSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  connectionString: z.string().optional(),
  isActive: z.boolean().optional(),
});

// Create server instance
const server = new McpServer({
  name: "DocGen",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

/**
 * Tool for retrieving DocGen templates
 * @param token - Bearer token for authentication
 * @returns List of document templates available to the user
 */
server.tool(
  "get-docgen-templates",
  "Get DocGen templates of user",
  {
    token: z.string().min(10, "Token must be at least 10 characters"),
  },
  async ({ token }) => {
    logger.info("Processing get-docgen-templates request");

    try {
      const url = `${config.apiBase}/v1/documentTemplates`;
      const response = await httpClient.authenticatedRequest(url, token);

      if (!response.success || !response.data) {
        logger.error("Failed to retrieve templates", {
          status: response.status,
          error: response.error,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve templates: ${
                response.error || "Unknown error"
              }`,
            },
          ],
        };
      }

      // Validate response data
      let validatedData;
      try {
        if (Array.isArray(response.data)) {
          validatedData = response.data.map((item) =>
            DocGenTemplateSchema.parse(item)
          );
        } else {
          validatedData = response.data;
        }
      } catch (validationError) {
        logger.warn("Template data validation failed", {
          error: validationError,
        });
        validatedData = response.data; // Use original data if validation fails
      }

      logger.info("Successfully retrieved templates", {
        count: Array.isArray(validatedData) ? validatedData.length : 1,
      });

      return {
        content: [
          {
            type: "text",
            text:
              typeof validatedData === "string"
                ? validatedData
                : JSON.stringify(validatedData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error in get-docgen-templates", { error: errorMessage });

      return {
        content: [
          {
            type: "text",
            text: `Error retrieving templates: ${errorMessage}`,
          },
        ],
      };
    }
  }
);

/**
 * Tool for retrieving DocGen data sources
 * @param token - Bearer token for authentication
 * @returns List of data sources available to the user
 */
server.tool(
  "get-docgen-datasources",
  "Get DocGen DataSources",
  {
    token: z.string().min(10, "Token must be at least 10 characters"),
  },
  async ({ token }) => {
    logger.info("Processing get-docgen-datasources request");

    try {
      const url = `${config.apiBase}/v1/dataSources`;
      const response = await httpClient.authenticatedRequest(url, token);

      if (!response.success || !response.data) {
        logger.error("Failed to retrieve data sources", {
          status: response.status,
          error: response.error,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve data sources: ${
                response.error || "Unknown error"
              }`,
            },
          ],
        };
      }

      // Validate response data
      let validatedData;
      try {
        if (Array.isArray(response.data)) {
          validatedData = response.data.map((item) =>
            DocGenDataSourceSchema.parse(item)
          );
        } else {
          validatedData = response.data;
        }
      } catch (validationError) {
        logger.warn("Data source validation failed", {
          error: validationError,
        });
        validatedData = response.data; // Use original data if validation fails
      }

      logger.info("Successfully retrieved data sources", {
        count: Array.isArray(validatedData) ? validatedData.length : 1,
      });

      return {
        content: [
          {
            type: "text",
            text:
              typeof validatedData === "string"
                ? validatedData
                : JSON.stringify(validatedData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error in get-docgen-datasources", { error: errorMessage });

      return {
        content: [
          {
            type: "text",
            text: `Error retrieving data sources: ${errorMessage}`,
          },
        ],
      };
    }
  }
);

/**
 * Main function to initialize and start the MCP server
 */
async function main(): Promise<void> {
  try {
    logger.info("Starting DocGen MCP Server", {
      version: "1.0.0",
      apiBase: config.apiBase,
      logLevel: config.logging.level,
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info("DocGen MCP Server running on stdio");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Fatal error in main()", { error: errorMessage });

    // Graceful shutdown
    await cleanup();
    process.exit(1);
  }
}

/**
 * Cleanup function for graceful shutdown
 */
async function cleanup(): Promise<void> {
  logger.info("Performing cleanup...");
  logger.close();
}

// Handle process termination gracefully
process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down gracefully");
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  await cleanup();
  process.exit(0);
});

process.on("uncaughtException", async (error) => {
  logger.error("Uncaught exception", {
    error: error.message,
    stack: error.stack,
  });
  await cleanup();
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  logger.error("Unhandled rejection", { reason: String(reason) });
  await cleanup();
  process.exit(1);
});

// Start the server
main().catch(async (error) => {
  console.error("Failed to start server:", error);
  await cleanup();
  process.exit(1);
});

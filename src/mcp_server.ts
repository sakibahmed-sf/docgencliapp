#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { join } from "path";
import { z } from "zod";
import { fileURLToPath } from "url";
import { createWriteStream } from "fs";
import { Console } from "console";
import { mkdirSync, existsSync } from "fs";

// If using Node.js < 18, uncomment the following line:

const API_BASE = "https://us-wordaddinbff.sharefiletest.io/io/docgen";

// Create server instance
const server = new McpServer({
  name: "DocGen",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

server.tool(
  "get-docgen-templates",
  "Get DocGen templates of user",
  {
    token: z.string(),
  },
  async ({ token }) => {
    console.log("[MCP] get-docgen-templates tool for user:");

    const documentTemplates = `${API_BASE}/v1/documentTemplates`;
    const responseData = await makeRequest(documentTemplates, token);

    console.log("responseData", responseData);
    if (!responseData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve data",
          },
        ],
      };
    }

    // Ensure responseData is a string for the text content
    return {
      content: [
        {
          type: "text",
          text:
            typeof responseData === "string"
              ? responseData
              : JSON.stringify(responseData),
        },
      ],
    };
  }
);

server.tool(
  "get-docgen-datasources",
  "Get DocGen DataSources",
  {
    token: z.string(),
  },
  async ({ token }) => {
    console.log("[MCP] get-docgen-datasources tool");

    const documentTemplates = `${API_BASE}/v1/dataSources`;
    const responseData = await makeRequest(documentTemplates, token);

    console.log("responseData", responseData);
    if (!responseData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve data",
          },
        ],
      };
    }

    // Ensure responseData is a string for the text content
    return {
      content: [
        {
          type: "text",
          text:
            typeof responseData === "string"
              ? responseData
              : JSON.stringify(responseData),
        },
      ],
    };
  }
);

// Helper function for making  API requests
async function makeRequest<T>(url: string, token: string): Promise<T | null> {
  console.log("url", url);

  console.log("token", token);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  console.log("headers", headers);

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making NWS request:", error);
    return null;
  }
}

async function main() {
  // Setup log file path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = join(__filename, "..");
  const logFilePath = join(__dirname, "..", "logs", "server.log");

  // Ensure log directory exists
  const logDir = join(__dirname, "..", "logs");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Create write stream for logging
  const logStream = createWriteStream(logFilePath, { flags: "a" });
  const logger = new Console({ stdout: logStream, stderr: logStream });

  // Redirect console.log and console.error to log file
  console.log = (...args) => logger.log(...args);
  console.error = (...args) => logger.error(...args);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Docgen MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

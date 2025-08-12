/**
 * MCP Client for DocGen CLI
 * Provides an interactive CLI interface for communicating with DocGen APIs
 * through the Model Context Protocol and Ollama for natural language processing
 */

import fetch from "node-fetch";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import { fileURLToPath } from "url";
import { join } from "path";
import { jwtDecode } from "jwt-decode";

import { config } from "./config/index.js";
import { createLogger, Logger } from "./utils/logger.js";
import { readFileContent, FileSystemError } from "./utils/fileUtils.js";
import { HttpClient } from "./utils/httpClient.js";

// Initialize logger
const logger = createLogger(
  join(fileURLToPath(import.meta.url), "..", "..", "logs"),
  config.logging.level,
  config.logging.maxLogSize
);

// Initialize HTTP client
const httpClient = new HttpClient(logger);

/**
 * Interface for JWT token payload
 */
interface TokenPayload {
  exp?: number;
  iat?: number;
  sub?: string;
  [key: string]: any;
}

/**
 * Interface for tool definition
 */
interface Tool {
  name: string;
  description: string;
  input_schema: any;
}

/**
 * Interface for Ollama response
 */
interface OllamaResponse {
  response: string;
  done: boolean;
  model?: string;
}

let token: string | null = null;

/**
 * Retrieves the authentication token from the callback file
 * @returns Promise resolving to the JWT token
 * @throws Error if token cannot be retrieved or is invalid
 */
async function getToken(): Promise<string> {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = join(__filename, "..");
    const filePath = join(__dirname, "..", "dist", "callback.json");

    logger.debug("Reading token from callback file", { filePath });

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

    logger.info("Token retrieved successfully");
    return json.token;
  } catch (error) {
    if (error instanceof FileSystemError) {
      logger.error("Failed to read token file", {
        error: error.message,
        code: error.code,
      });
      throw new Error(
        "Authentication token not found. Please run authentication first."
      );
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error retrieving token", { error: errorMessage });
    throw new Error(`Failed to retrieve authentication token: ${errorMessage}`);
  }
}

/**
 * Validates if a JWT token is still valid
 * @param token - JWT token to validate
 * @returns True if token is valid and not expired
 */
function isTokenValid(token: string): boolean {
  try {
    const decoded: TokenPayload = jwtDecode(token);
    const now = Date.now() / 1000;

    // Check if token has expiration and if it's still valid
    if (decoded.exp && decoded.exp <= now) {
      logger.warn("Token has expired", {
        expiry: new Date(decoded.exp * 1000).toISOString(),
        now: new Date(now * 1000).toISOString(),
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Token validation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Enhanced MCP Client with improved error handling and validation
 */
class MCPClient {
  private mcp: Client;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];
  private logger: Logger;
  private ollamaUrl: string;
  private ollamaModel: string;

  constructor() {
    this.mcp = new Client({
      name: "mcp-client-cli",
      version: "1.0.0",
    });
    this.logger = logger;
    this.ollamaUrl = config.ollama.url;
    this.ollamaModel = config.ollama.model;
  }

  /**
   * Connect to MCP server with enhanced error handling
   * @param serverScriptPath - Path to the server script
   * @throws Error if connection fails
   */
  async connectToServer(serverScriptPath: string): Promise<void> {
    try {
      // Validate server script path
      if (!serverScriptPath || typeof serverScriptPath !== "string") {
        throw new Error("Server script path must be a non-empty string");
      }

      if (!serverScriptPath.endsWith(".js")) {
        throw new Error("Server script must be a .js file");
      }

      this.logger.info("Connecting to MCP server", {
        serverScript: serverScriptPath,
      });

      const command = process.execPath;
      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });

      await this.mcp.connect(this.transport);

      // Retrieve and validate tools
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || "", // Provide default empty string
        input_schema: tool.inputSchema,
      }));

      this.logger.info("Successfully connected to MCP server", {
        toolCount: this.tools.length,
        tools: this.tools.map((t) => t.name),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to connect to MCP server", {
        error: errorMessage,
      });
      throw new Error(`MCP server connection failed: ${errorMessage}`);
    }
  }

  /**
   * Get all available tool names as a comma-separated string
   * @returns Comma-separated list of tool names
   */
  getAllToolNames(): string {
    return this.tools.map((tool) => tool.name).join(", ");
  }

  /**
   * Disconnect from MCP server and cleanup resources
   */
  async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }
      this.logger.info("Disconnected from MCP server");
    } catch (error) {
      this.logger.error("Error during disconnect", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async process(query: string) {
    const toolNames = this.getAllToolNames();
    const querymessages = [
      {
        role: "system",
        content: `You are an intelligent assistant. Given the user's query and the following available tools: [${toolNames}], determine if the query clearly matches the purpose of any tool. If so, respond with the tool name and a suggested action if relevant. If there is no clear match, respond with tool: None and action: None, and provide a helpful answer to the user's query. Do not mention tool selection or matching in your response. If you specify a tool name and action, the system will automatically call that tool and process the query using the action. Always answer only in English.`,
      },
      {
        role: "user",
        content: query,
      },
    ];
    const ollamaResponseForPrompt = await fetch(
      `${this.ollamaUrl}/api/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: querymessages.map((m) => m.content).join("\n"),
          stream: false,
          format: {
            type: "object",
            properties: {
              tool: {
                type: "string",
              },
              action: {
                type: "string",
              },
              response: {
                type: "string",
              },
            },
            required: ["tool", "action", "response"],
          },
        }),
      }
    );

    if (!ollamaResponseForPrompt.ok) {
      throw new Error(`Ollama error: ${ollamaResponseForPrompt.status}`);
    }
    const repomseData = (await ollamaResponseForPrompt.json()) as any;
    let finalTextData = repomseData.response;

    if (typeof finalTextData === "string") {
      finalTextData = JSON.parse(finalTextData);
    }

    return finalTextData;
  }

  async summarizeResponse(query: string) {
    const querymessages = [
      {
        role: "system",
        content: `You are an assistant that summarizes JSON API responses for users. Given the user's query and the JSON response from an API, generate a clear, detailed, and helpful summary in plain English. Focus on the most important information, explain any key fields or values, and highlight anything that would be useful or actionable for the user. Do not repeat the raw JSON, but instead interpret and explain it in a user-friendly way.`,
      },
      {
        role: "user",
        content: query,
      },
    ];
    const ollamaResponseForPrompt = await fetch(
      `${this.ollamaUrl}/api/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: querymessages.map((m) => m.content).join("\n"),
          stream: false,
        }),
      }
    );

    if (!ollamaResponseForPrompt.ok) {
      throw new Error(`Ollama error: ${ollamaResponseForPrompt.status}`);
    }
    const repomseData = (await ollamaResponseForPrompt.json()) as any;
    let finalTextData = repomseData.response || "";

    if (typeof finalTextData === "string") {
      finalTextData = JSON.parse(finalTextData);
    }

    return finalTextData;
  }

  async processAction(query: any, action: string) {
    const querymessages = [
      {
        role: "system",
        content: `You are an expert assistant that receives a JSON API response and a specific action to perform on it. Your job is to carefully analyze the JSON data and execute the requested action as accurately as possible. The action may involve extracting information, transforming data, filtering, summarizing, or any other operation described in the action string. Always provide a clear, step-by-step explanation of how you performed the action, and present the final result in a concise and user-friendly format. If the action cannot be performed due to missing or invalid data, explain why and suggest what is needed. Do not repeat the raw JSON unless explicitly asked. Always answer only in English.`,
      },
      {
        role: "user",
        content: `Here is the JSON response:\n${query}\n\nAction to perform: ${action}`,
      },
    ];
    const ollamaResponseForPrompt = await fetch(
      `${this.ollamaUrl}/api/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: querymessages.map((m) => m.content).join("\n"),
          stream: false,
        }),
      }
    );

    if (!ollamaResponseForPrompt.ok) {
      throw new Error(`Ollama error: ${ollamaResponseForPrompt.status}`);
    }
    const repomseData = (await ollamaResponseForPrompt.json()) as any;

    console.log("repomseData", repomseData);
    let finalTextData = repomseData.response;

    console.log("Process Action response", finalTextData);

    return finalTextData;
  }

  async processQuery(query: string) {
    if (!token) {
      token = await getToken();
    }

    const toolNames = this.getAllToolNames();

    let response: {
      tool: string;
      response: string;
      action: string;
    } = await this.process(query);

    let toolName = response.tool;
    let result: any = response.response;
    let action = response.action;

    if (toolNames.includes(toolName)) {
      console.log(`\nCalling tool `, toolName);
      result = await this.mcp.callTool({
        name: toolName,
        arguments: { token },
      });
      //   if (action !== "None") {
      //     console.log("\nPerforming action", action);
      //     try {
      //       const r = await this.processAction(JSON.stringify(result), action);
      //       console.log("r", r);
      //     } catch (e) {
      //       console.log("Error ", e);
      //     }
      //   }
    }

    return result;
  }

  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      if (!token) {
        token = await getToken();
      }

      const decoded: any = jwtDecode(token);
      const userName = decoded?.name;

      const now = new Date();
      const hour = now.getHours();
      let greeting = "";
      if (hour >= 5 && hour < 12) {
        greeting = "Good morning";
      } else if (hour >= 12 && hour < 18) {
        greeting = "Good afternoon";
      } else if (hour >= 18 && hour < 22) {
        greeting = "Good evening";
      }

      console.log(`\nHello, ${userName}! ${greeting ? ` ${greeting}.` : ""}`);
      console.log("Type your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");

        if (message.toLowerCase() === "quit") {
          break;
        }

        const response = await this.processQuery(message);
        console.log("Response:\n");
        console.log(response);
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    await this.mcp.close();
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: node index.ts <path_to_server_script>");
    return;
  }
  const mcpClient = new MCPClient();
  try {
    await mcpClient.connectToServer(process.argv[2]);
    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();

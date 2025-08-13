/**
 * MCP Service
 * Handles Model Context Protocol client operations
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  Tool,
  MCPCallResult,
  ServiceResult,
  AppError,
} from "../types/index.js";
import { Logger } from "../utils/logger.js";

export class MCPService {
  private mcp: Client;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.mcp = new Client({
      name: "mcp-client-cli",
      version: "1.0.0",
    });
    this.logger = logger;
  }

  /**
   * Connect to MCP server
   */
  async connect(serverScriptPath: string): Promise<ServiceResult<Tool[]>> {
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
        description: tool.description || "",
        input_schema: tool.inputSchema,
      }));

      this.logger.info("Successfully connected to MCP server", {
        toolCount: this.tools.length,
        tools: this.tools.map((t) => t.name),
      });

      return { success: true, data: this.tools };
    } catch (error) {
      const appError: AppError = {
        code: "MCP_CONNECTION_ERROR",
        message: error instanceof Error ? error.message : String(error),
        context: { serverScriptPath },
      };

      this.logger.error("Failed to connect to MCP server", { error: appError });
      return { success: false, error: appError };
    }
  }

  /**
   * Call a tool with the given arguments
   */
  async callTool(
    toolName: string,
    args: Record<string, any>
  ): Promise<ServiceResult<MCPCallResult>> {
    try {
      if (!this.isConnected()) {
        throw new Error("MCP client is not connected");
      }

      if (!this.tools.some((tool) => tool.name === toolName)) {
        throw new Error(`Tool '${toolName}' is not available`);
      }

      this.logger.debug("Calling MCP tool", { toolName, args });

      const result = await this.mcp.callTool({
        name: toolName,
        arguments: args,
      });

      this.logger.info("MCP tool called successfully", { toolName });

      return { success: true, data: result };
    } catch (error) {
      const appError: AppError = {
        code: "MCP_TOOL_CALL_ERROR",
        message: error instanceof Error ? error.message : String(error),
        context: { toolName, args },
      };

      this.logger.error("Failed to call MCP tool", { error: appError });
      return { success: false, error: appError };
    }
  }

  /**
   * Get all available tool names
   */
  getAvailableTools(): string[] {
    return this.tools.map((tool) => tool.name);
  }

  /**
   * Check if the client is connected
   */
  isConnected(): boolean {
    return this.transport !== null;
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }
      this.logger.info("Disconnected from MCP server");
    } catch (error) {
      this.logger.error("Error during MCP disconnect", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.mcp.close();
      await this.disconnect();
    } catch (error) {
      this.logger.error("Error during MCP cleanup", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

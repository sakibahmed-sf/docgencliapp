#!/usr/bin/env node

/**
 * DocGen CLI Application Entry Point
 * Provides a command-line interface for interacting with DocGen APIs
 */

import { program } from "commander";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

import { config } from "./config/index.js";
import { createLogger } from "./utils/logger.js";
import { MCPClient } from "./mcp_client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize logger
const logger = createLogger(
  join(__dirname, "..", "logs"),
  config.logging.level,
  config.logging.maxLogSize
);

/**
 * Start the authentication server
 */
async function startAuthServer(): Promise<void> {
  try {
    logger.info("Starting authentication server...");
    const { startServer } = await import("./server.js");
    await startServer();
  } catch (error) {
    logger.error("Failed to start authentication server", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

/**
 * Start the interactive CLI
 */
async function startCLI(): Promise<void> {
  try {
    const serverPath = join(__dirname, "mcp_server.js");
    const mcpClient = new MCPClient();

    await mcpClient.connectToServer(serverPath);
    await mcpClient.chatLoop();
  } catch (error) {
    logger.error("Failed to start CLI", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

/**
 * Start the complete application flow
 */
async function startApplication(): Promise<void> {
  try {
    logger.info("Starting DocGen CLI application...");
    logger.info("This will start the authentication server and open your browser.");
    logger.info("After completing authentication, run 'docgen chat' to start the interactive CLI.");
    
    // Start the authentication server (this will handle the full auth flow)
    await startAuthServer();
    
  } catch (error) {
    logger.error("Failed to start application", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Configure CLI commands
program
  .name("docgen")
  .description(
    "DocGen CLI - Interact with DocGen APIs through natural language"
  )
  .version("1.0.0");

program
  .command("start")
  .description("Start the complete DocGen CLI application flow")
  .action(startApplication);

program
  .command("auth")
  .description("Start the authentication server")
  .action(startAuthServer);

program
  .command("chat")
  .description("Start the interactive CLI chat interface")
  .action(startCLI);

program
  .command("server")
  .description("Start the MCP server (for external use)")
  .action(async () => {
    try {
      await import("./mcp_server.js");
    } catch (error) {
      logger.error("Failed to start MCP server", {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// If no command specified, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

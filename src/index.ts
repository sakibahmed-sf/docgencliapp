#!/usr/bin/env node

/**
 * DocGen CLI Main Entry Point
 * Provides command-line interface for the DocGen CLI application
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Display help information
 */
function showHelp(): void {
  console.log(`
DocGen CLI - Document Generation Command Line Interface

Usage:
  docgen <command> [options]

Commands:
  start     Start the authentication flow and interactive CLI
  help      Show this help message

Examples:
  docgen start    # Start the complete authentication and CLI flow
  docgen help     # Show help information

For more information, visit: https://github.com/sakibahmed-sf/docgencliapp
`);
}

/**
 * Start the complete DocGen CLI application flow
 */
async function startApplication(): Promise<void> {
  console.log("🚀 Starting DocGen CLI...");
  
  try {
    // Start the authentication server
    console.log("📡 Starting authentication server...");
    const serverPath = join(__dirname, "server.js");
    const serverProcess = spawn("node", [serverPath], {
      stdio: "inherit",
      detached: false,
    });

    // Handle server process events
    serverProcess.on("close", (code) => {
      if (code === 0) {
        console.log("✅ Authentication completed successfully!");
        startMCPClient();
      } else {
        console.error(`❌ Authentication server exited with code ${code}`);
        process.exit(1);
      }
    });

    serverProcess.on("error", (error) => {
      console.error(`❌ Failed to start authentication server: ${error.message}`);
      process.exit(1);
    });

  } catch (error) {
    console.error(`❌ Error starting application: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Start the MCP client for interactive queries
 */
function startMCPClient(): void {
  console.log("🤖 Starting MCP client...");
  
  const mcpServerPath = join(__dirname, "mcp_server.js");
  const mcpClientPath = join(__dirname, "mcp_client.js");
  
  const clientProcess = spawn("node", [mcpClientPath, mcpServerPath], {
    stdio: "inherit",
  });

  clientProcess.on("error", (error) => {
    console.error(`❌ Failed to start MCP client: ${error.message}`);
    process.exit(1);
  });
}

/**
 * Main CLI function
 */
function main(): void {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  switch (command) {
    case "start":
      startApplication();
      break;
    
    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;
    
    case undefined:
      console.log("❌ No command specified. Use 'docgen help' for usage information.");
      process.exit(1);
      break;
    
    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log("Use 'docgen help' for available commands.");
      process.exit(1);
  }
}

// Handle uncaught errors gracefully
process.on("uncaughtException", (error) => {
  console.error(`❌ Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`❌ Unhandled rejection: ${String(reason)}`);
  process.exit(1);
});

// Start the CLI
main();
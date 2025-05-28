#!/usr/bin/env node
import { Command } from "commander";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .command("start")
  .description("Login and Start")
  .action(async () => {
    try {
      const open =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
          ? "start"
          : "xdg-open";

      // Start the server by running server.js, then open the browser, then run the client and server build scripts
      const startScript = `${open} https://localhost:3000 && node ${path.resolve(
        __dirname,
        "server.js"
      )} && node ${path.resolve(__dirname, "mcp_client.js")} ${path.resolve(
        __dirname,
        "mcp_server.js"
      )}`;

      execSync(startScript, { stdio: "inherit" });
    } catch (err) {
      console.error("Failed to run start script:", err);
      process.exit(1);
    }
  });

program.parse(process.argv);

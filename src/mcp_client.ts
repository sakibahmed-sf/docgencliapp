import fetch from "node-fetch";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import { fileURLToPath } from "url";
import { join } from "path";
import { readFile } from "fs/promises";
import { jwtDecode } from "jwt-decode";

let token: any = null;

async function getToken() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = join(__filename, "..");

  const filePath = join(__dirname, "..", "dist", "callback.json");
  const res = await readFile(filePath, "utf-8");
  const json = JSON.parse(res);
  return json.token;
}

class MCPClient {
  private mcp: Client;
  private transport: StdioClientTransport | null = null;
  private tools: any = [];
  private ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  private ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5";

  constructor() {
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  async connectToServer(serverScriptPath: string) {
    try {
      const isJs = serverScriptPath.endsWith(".js");
      if (!isJs) {
        throw new Error("Server script must be a .js file");
      }
      const command = process.execPath;

      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });
      this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  getAllToolNames() {
    const toolNames = this.tools.map((tool: any) => tool.name).join(", ");
    return toolNames;
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

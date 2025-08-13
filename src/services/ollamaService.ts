/**
 * Ollama Service
 * Handles communication with Ollama for natural language processing
 */

import fetch from "node-fetch";
import {
  OllamaResponse,
  ProcessedQuery,
  ProcessedQuerySchema,
  ServiceResult,
  AppError,
} from "../types/index.js";
import { config } from "../config/index.js";
import { Logger } from "../utils/logger.js";

export class OllamaService {
  private logger: Logger;
  private ollamaUrl: string;
  private ollamaModel: string;

  constructor(logger: Logger) {
    this.logger = logger;
    this.ollamaUrl = config.ollama.url;
    this.ollamaModel = config.ollama.model;
  }

  /**
   * Process a query to determine tool selection and actions
   */
  async processQuery(
    query: string,
    availableTools: string[]
  ): Promise<ServiceResult<ProcessedQuery>> {
    try {
      const systemPrompt = this.buildSystemPrompt(availableTools);
      const response = await this.callOllama(systemPrompt, query, {
        type: "object",
        properties: {
          tool: { type: "string" },
          action: { type: "string" },
          response: { type: "string" },
        },
        required: ["tool", "action", "response"],
      });

      const processedQuery = ProcessedQuerySchema.parse(response);

      this.logger.debug("Query processed successfully", {
        query,
        tool: processedQuery.tool,
        action: processedQuery.action,
      });

      return { success: true, data: processedQuery };
    } catch (error) {
      const appError: AppError = {
        code: "OLLAMA_PROCESS_ERROR",
        message: error instanceof Error ? error.message : String(error),
        context: { query, availableTools },
      };

      this.logger.error("Failed to process query with Ollama", {
        error: appError,
      });
      return { success: false, error: appError };
    }
  }

  /**
   * Summarize API response data
   */
  async summarizeResponse(
    data: string,
    userQuery: string
  ): Promise<ServiceResult<string>> {
    try {
      const systemPrompt = `You are an assistant that summarizes JSON API responses for users. Given the user's query and the JSON response from an API, generate a clear, detailed, and helpful summary in plain English. Focus on the most important information, explain any key fields or values, and highlight anything that would be useful or actionable for the user. Do not repeat the raw JSON, but instead interpret and explain it in a user-friendly way.`;

      const userPrompt = `User Query: ${userQuery}\n\nAPI Response: ${data}`;

      const response = await this.callOllama(systemPrompt, userPrompt);

      this.logger.debug("Response summarized successfully");

      return { success: true, data: response };
    } catch (error) {
      const appError: AppError = {
        code: "OLLAMA_SUMMARIZE_ERROR",
        message: error instanceof Error ? error.message : String(error),
        context: { userQuery },
      };

      this.logger.error("Failed to summarize response with Ollama", {
        error: appError,
      });
      return { success: false, error: appError };
    }
  }

  /**
   * Process specific actions on API response data
   */
  async processAction(
    data: string,
    action: string
  ): Promise<ServiceResult<string>> {
    try {
      const systemPrompt = `You are an expert assistant that receives a JSON API response and a specific action to perform on it. Your job is to carefully analyze the JSON data and execute the requested action as accurately as possible. The action may involve extracting information, transforming data, filtering, summarizing, or any other operation described in the action string. Always provide a clear, step-by-step explanation of how you performed the action, and present the final result in a concise and user-friendly format. If the action cannot be performed due to missing or invalid data, explain why and suggest what is needed. Do not repeat the raw JSON unless explicitly asked. Always answer only in English.`;

      const userPrompt = `Here is the JSON response:\n${data}\n\nAction to perform: ${action}`;

      const response = await this.callOllama(systemPrompt, userPrompt);

      this.logger.debug("Action processed successfully", { action });

      return { success: true, data: response };
    } catch (error) {
      const appError: AppError = {
        code: "OLLAMA_ACTION_ERROR",
        message: error instanceof Error ? error.message : String(error),
        context: { action },
      };

      this.logger.error("Failed to process action with Ollama", {
        error: appError,
      });
      return { success: false, error: appError };
    }
  }

  /**
   * Build system prompt for tool selection
   */
  private buildSystemPrompt(availableTools: string[]): string {
    return `You are an intelligent assistant. Given the user's query and the following available tools: [${availableTools.join(
      ", "
    )}], determine if the query clearly matches the purpose of any tool. If so, respond with the tool name and a suggested action if relevant. If there is no clear match, respond with tool: None and action: None, and provide a helpful answer to the user's query. Do not mention tool selection or matching in your response. If you specify a tool name and action, the system will automatically call that tool and process the query using the action. Always answer only in English.`;
  }

  /**
   * Make a call to Ollama API
   */
  private async callOllama(
    systemPrompt: string,
    userPrompt: string,
    format?: any
  ): Promise<string> {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const requestBody: any = {
      model: this.ollamaModel,
      prompt: messages.map((m) => m.content).join("\n"),
      stream: false,
    };

    if (format) {
      requestBody.format = format;
    }

    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText}`
      );
    }

    const responseData = (await response.json()) as any;
    let result = responseData.response;

    // Try to parse as JSON if it's a formatted response
    if (format && typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch {
        // If parsing fails, return as string
      }
    }

    return result;
  }
}

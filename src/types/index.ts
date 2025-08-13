/**
 * Type definitions for DocGen CLI Application
 */

import { z } from "zod";

// ===== Authentication Types =====

export const TokenPayloadSchema = z.object({
  exp: z.number().optional(),
  iat: z.number().optional(),
  sub: z.string().optional(),
  name: z.string().optional(),
});

export type TokenPayload = z.infer<typeof TokenPayloadSchema>;

// ===== DocGen API Types =====

export const DocGenTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const DocGenDataSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  connectionString: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type DocGenTemplate = z.infer<typeof DocGenTemplateSchema>;
export type DocGenDataSource = z.infer<typeof DocGenDataSourceSchema>;

// ===== MCP Types =====

export interface Tool {
  name: string;
  description: string;
  input_schema: any;
}

export interface MCPCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
    [key: string]: any;
  }>;
}

// ===== Ollama Types =====

export const OllamaResponseSchema = z.object({
  response: z.string(),
  done: z.boolean(),
  model: z.string().optional(),
});

export const ProcessedQuerySchema = z.object({
  tool: z.string(),
  action: z.string(),
  response: z.string(),
});

export type OllamaResponse = z.infer<typeof OllamaResponseSchema>;
export type ProcessedQuery = z.infer<typeof ProcessedQuerySchema>;

// ===== Error Types =====

export interface ErrorContext {
  [key: string]: any;
}

export interface AppError {
  code: string;
  message: string;
  context?: ErrorContext;
  cause?: Error;
}

// ===== Service Results =====

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: AppError;
}

// ===== CLI Types =====

export interface CLIOptions {
  verbose?: boolean;
  config?: string;
  timeout?: number;
}

export interface AuthServerOptions {
  port?: number;
  certPath?: string;
  keyPath?: string;
}

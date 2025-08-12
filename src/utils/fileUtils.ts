/**
 * Enhanced file utilities with security and validation
 */

import { readFile, writeFile, mkdir, stat, access } from "fs/promises";
import { constants } from "fs";
import path from "path";

export interface FileValidationOptions {
  maxSize?: number;
  allowedExtensions?: string[];
  requireExists?: boolean;
}

export class FileSystemError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly path?: string
  ) {
    super(message);
    this.name = "FileSystemError";
  }
}

/**
 * Validates and sanitizes file paths to prevent directory traversal attacks
 * @param filePath - The file path to validate
 * @param basePath - Base directory path (defaults to current working directory)
 * @returns Resolved and validated absolute path
 * @throws FileSystemError if path is invalid or outside base directory
 */
export async function validateAndResolvePath(
  filePath: string,
  basePath?: string
): Promise<string> {
  const resolvedBasePath = path.resolve(basePath || process.cwd());
  const resolvedFilePath = path.resolve(filePath);

  // Check if resolved path is within the base directory
  if (!resolvedFilePath.startsWith(resolvedBasePath)) {
    throw new FileSystemError(
      `Path traversal detected: ${filePath} resolves outside base directory`,
      "PATH_TRAVERSAL",
      filePath
    );
  }

  return resolvedFilePath;
}

/**
 * Validates file against specified criteria
 * @param filePath - Absolute path to the file
 * @param options - Validation options
 * @throws FileSystemError if validation fails
 */
export async function validateFile(
  filePath: string,
  options: FileValidationOptions = {}
): Promise<void> {
  const {
    maxSize = 10 * 1024 * 1024,
    allowedExtensions,
    requireExists = true,
  } = options;

  if (requireExists) {
    try {
      await access(filePath, constants.F_OK);
    } catch {
      throw new FileSystemError(
        `File not found: ${filePath}`,
        "FILE_NOT_FOUND",
        filePath
      );
    }
  }

  // Check file size
  try {
    const stats = await stat(filePath);
    if (stats.size > maxSize) {
      throw new FileSystemError(
        `File too large: ${filePath} (${stats.size} bytes > ${maxSize} bytes)`,
        "FILE_TOO_LARGE",
        filePath
      );
    }
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }
    // If file doesn't exist and requireExists is false, that's OK
    if (!requireExists) {
      return;
    }
    throw new FileSystemError(
      `Cannot access file: ${filePath}`,
      "ACCESS_ERROR",
      filePath
    );
  }

  // Check file extension
  if (allowedExtensions && allowedExtensions.length > 0) {
    const ext = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      throw new FileSystemError(
        `Invalid file extension: ${ext}. Allowed: ${allowedExtensions.join(
          ", "
        )}`,
        "INVALID_EXTENSION",
        filePath
      );
    }
  }
}

/**
 * Safely read file content with validation
 * @param filePath - Path to the file to read
 * @param options - Validation options
 * @param encoding - File encoding (defaults to utf-8)
 * @returns File content as string
 * @throws FileSystemError if file is invalid or cannot be read
 */
export async function readFileContent(
  filePath: string,
  options: FileValidationOptions = {},
  encoding: BufferEncoding = "utf-8"
): Promise<string> {
  try {
    const validatedPath = await validateAndResolvePath(filePath);
    await validateFile(validatedPath, options);

    return await readFile(validatedPath, encoding);
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }
    throw new FileSystemError(
      `Failed to read file: ${filePath} - ${
        error instanceof Error ? error.message : String(error)
      }`,
      "READ_ERROR",
      filePath
    );
  }
}

/**
 * Safely write file content with directory creation
 * @param filePath - Path to the file to write
 * @param content - Content to write
 * @param options - Validation options
 * @param encoding - File encoding (defaults to utf-8)
 * @throws FileSystemError if file cannot be written
 */
export async function writeFileContent(
  filePath: string,
  content: string,
  options: FileValidationOptions = {},
  encoding: BufferEncoding = "utf-8"
): Promise<void> {
  try {
    const validatedPath = await validateAndResolvePath(filePath);

    // Validate file without requiring it to exist
    await validateFile(validatedPath, { ...options, requireExists: false });

    // Ensure directory exists
    const dir = path.dirname(validatedPath);
    await ensureDirectoryExists(dir);

    await writeFile(validatedPath, content, encoding);
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }
    throw new FileSystemError(
      `Failed to write file: ${filePath} - ${
        error instanceof Error ? error.message : String(error)
      }`,
      "WRITE_ERROR",
      filePath
    );
  }
}

/**
 * Safely create directory with validation
 * @param dirPath - Directory path to create
 * @param basePath - Base directory path (defaults to current working directory)
 * @throws FileSystemError if directory cannot be created
 */
export async function ensureDirectoryExists(
  dirPath: string,
  basePath?: string
): Promise<void> {
  try {
    const validatedPath = await validateAndResolvePath(dirPath, basePath);
    await mkdir(validatedPath, { recursive: true });
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }
    throw new FileSystemError(
      `Failed to create directory: ${dirPath} - ${
        error instanceof Error ? error.message : String(error)
      }`,
      "MKDIR_ERROR",
      dirPath
    );
  }
}

/**
 * Check if file exists and is accessible
 * @param filePath - Path to check
 * @returns True if file exists and is accessible
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file stats safely
 * @param filePath - Path to the file
 * @returns File stats or null if file doesn't exist
 */
export async function getFileStats(
  filePath: string
): Promise<{ size: number; mtime: Date } | null> {
  try {
    const validatedPath = await validateAndResolvePath(filePath);
    const stats = await stat(validatedPath);
    return {
      size: stats.size,
      mtime: stats.mtime,
    };
  } catch {
    return null;
  }
}

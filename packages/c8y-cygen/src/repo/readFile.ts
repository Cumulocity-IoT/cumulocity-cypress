import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";

export interface ReadRepoFileOptions {
  /** Path to the checked-out target app repo (e.g. cumulocity-ui-e2e). */
  appRepoPath: string;
  /** Relative to appRepoPath, e.g. "cypress/support/commands.ts". */
  relativePath: string;
}

export interface ReadRepoFileResult {
  absolutePath: string;
  content: string;
}

export class ReadFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadFileError";
  }
}

/**
 * Reads a file from the target app repo - the agent's way to inspect existing
 * code (custom Cypress commands, other house-style specs, config) without
 * writing and running a throwaway spec just to learn what something returns.
 * Refuses to read outside appRepoPath, mirroring writeSpec's escape guard.
 */
export async function readRepoFile(
  options: ReadRepoFileOptions
): Promise<ReadRepoFileResult> {
  const { appRepoPath, relativePath } = options;

  if (path.isAbsolute(relativePath)) {
    throw new ReadFileError(
      `relativePath must be relative, got an absolute path: ${relativePath}`
    );
  }

  const resolvedAppRepo = path.resolve(appRepoPath);
  const absolutePath = path.resolve(resolvedAppRepo, relativePath);
  const relativeFromRepo = path.relative(resolvedAppRepo, absolutePath);

  if (relativeFromRepo.startsWith("..") || path.isAbsolute(relativeFromRepo)) {
    throw new ReadFileError(
      `Refusing to read outside the app repo: "${relativePath}" resolves to ` +
        `${absolutePath}, which escapes ${resolvedAppRepo}`
    );
  }

  let content: string;
  try {
    content = await fsReadFile(absolutePath, "utf-8");
  } catch (cause) {
    throw new ReadFileError(
      `Could not read "${relativePath}": ${(cause as Error).message}`
    );
  }

  return { absolutePath, content };
}

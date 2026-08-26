import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface WriteSpecOptions {
  /** Path to the checked-out target app repo (e.g. cumulocity-ui-e2e). */
  appRepoPath: string;
  /** Relative to appRepoPath, e.g. "cypress/e2e/dataAndControlTeam/events.cy.ts". */
  relativePath: string;
  content: string;
}

export interface WriteSpecResult {
  absolutePath: string;
}

export class WriteSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteSpecError";
  }
}

/**
 * Writes a generated spec into the target app's own cypress/e2e tree. Refuses
 * to write outside appRepoPath - the agent supplies relativePath, and a
 * hallucinated or adversarial "../../../etc/passwd"-style path must not
 * silently escape the repo it was asked to write into.
 */
export async function writeSpec(
  options: WriteSpecOptions
): Promise<WriteSpecResult> {
  const { appRepoPath, relativePath, content } = options;

  if (path.isAbsolute(relativePath)) {
    throw new WriteSpecError(
      `relativePath must be relative, got an absolute path: ${relativePath}`
    );
  }

  const resolvedAppRepo = path.resolve(appRepoPath);
  const absolutePath = path.resolve(resolvedAppRepo, relativePath);
  const relativeFromRepo = path.relative(resolvedAppRepo, absolutePath);

  if (relativeFromRepo.startsWith("..") || path.isAbsolute(relativeFromRepo)) {
    throw new WriteSpecError(
      `Refusing to write outside the app repo: "${relativePath}" resolves to ` +
        `${absolutePath}, which escapes ${resolvedAppRepo}`
    );
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf-8");

  return { absolutePath };
}

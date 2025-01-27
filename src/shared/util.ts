import * as path from "path";
import * as fs from "fs";

export function safeStringify(obj: any, indent = 2) {
  let cache: any[] = [];
  const retVal = JSON.stringify(
    obj,
    (key, value) =>
      typeof value === "object" && value !== null
        ? cache.includes(value)
          ? undefined
          : cache.push(value) && value
        : value,
    indent
  );
  cache = [];
  return retVal;
}

export function getPackageVersion() {
  try {
    let currentDir = __dirname;
    let packageJsonPath;
    let maxLevels = 3;
    while (maxLevels > 0) {
      packageJsonPath = path.resolve(currentDir, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf8")
        );
        return packageJson.version;
      }
      currentDir = path.dirname(currentDir);
      maxLevels--;
    }
  } catch {
    console.error(
      "Failed to get version from package.json. package.json not found."
    );
  }
  return "unknown";
}

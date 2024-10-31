import * as yaml from "yaml";
import * as fs from "fs";
import * as path from "path";

import { C8yScreenshotOptions } from "../lib/screenshots/types";

export function readYamlFile(filePath: string): any {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const data = yaml.parse(fileContent);
  return data;
}

export function createInitConfig(baseUrl: string): string {
  return `
# yaml-language-server: $schema=${__dirname}/schema.json

# The title is used to describe the screenshot run
title: "My screenshot automation"
# The baseUrl is the Cumulocity URL and can be overwritten by the command line argument
# All visit URLs are relative to this baseUrl
baseUrl: "${baseUrl}"

global:
  viewportWidth: 1440
  viewportHeight: 900
  language: en
  # For user "admin", set environment variables admin_username and admin_password
  user: admin

screenshots:
  - image: "/my/test/image.png"
    visit: "/apps/cockpit/index.html"
    tags:
      - cockpit
`;
}

export function resolveScreenshotFolder(
  args: Partial<C8yScreenshotOptions>
): string {
  const screenshotsFolder = path.resolve(
    process.cwd(),
    args.folder ?? "c8yscrn"
  );
  if (screenshotsFolder == process.cwd()) {
    throw new Error(
      `Please provide a screenshot folder path that does not resolve to the current working directory.`
    );
  }

  return screenshotsFolder;
}

export function resolveConfigOptions(args: Partial<C8yScreenshotOptions>): any {
  const browser = (args.browser ?? process.env.C8Y_BROWSER ?? "chrome")
    .toLowerCase()
    .trim();
  if (!["chrome", "firefox", "electron"].includes(browser)) {
    throw new Error(
      `Invalid browser ${browser}. Supported browsers are chrome, firefox, electron.`
    );
  }

  // might run in different environments, so we need to find the correct extension
  // this is required when running in development mode from ts files
  const fileExtension = resolveFileExtension();
  const cypressConfigFile = path.resolve(
    path.dirname(__filename),
    `config.${fileExtension}`
  );

  const screenshotsFolder = resolveScreenshotFolder(args);
  const baseUrl = resolveBaseUrl(args);

  return {
    configFile: cypressConfigFile,
    browser,
    testingType: "e2e" as const,
    quiet: args.quiet ?? true,
    config: {
      e2e: {
        baseUrl,
        screenshotsFolder,
        trashAssetsBeforeRuns: args.clear ?? false,
        specPattern: path.join(
          path.dirname(__filename),
          `*.cy.${fileExtension}`
        ),
      },
    },
  };
}

export function resolveFileExtension(): string {
  let fileExtension = __filename?.split(".")?.pop();
  if (!fileExtension || !["js", "ts", "mjs", "cjs"].includes(fileExtension)) {
    fileExtension = "js";
  }
  return fileExtension;
}

export function resolveBaseUrl(args: Partial<C8yScreenshotOptions>): string | undefined{
  return args.baseUrl ?? process.env.C8Y_BASEURL;
}

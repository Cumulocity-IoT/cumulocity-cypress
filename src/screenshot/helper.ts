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
  args: Partial<C8yScreenshotOptions> | string
): string {
  const screenshotsFolder = path.resolve(
    process.cwd(),
    (typeof args === "string" ? args : args?.folder) ?? "c8yscrn"
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

  const screenshotsFolder = resolveScreenshotFolder(args);
  const baseUrl = resolveBaseUrl(args);
  const cypressFolder = path.join(path.dirname(__filename), "cypress");
  return {
    configFile: path.resolve(cypressFolder, `config.js`),
    browser,
    testingType: "e2e" as const,
    quiet: args.quiet ?? true,
    project: cypressFolder,
    config: {
      e2e: {
        baseUrl,
        screenshotsFolder,
        trashAssetsBeforeRuns: args.clear ?? false,
        spec: path.join(cypressFolder, "screenshots.cy.js"),
        specPattern: path.resolve(cypressFolder, `*.cy.js`),
      },
    },
  };
}

export function resolveBaseUrl(
  args: Partial<C8yScreenshotOptions>
): string | undefined {
  return args.baseUrl ?? process.env.C8Y_BASEURL;
}

import * as yaml from "yaml";
import * as fs from "fs";

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
  viewportWidth: 1920
  viewportHeight: 1080
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
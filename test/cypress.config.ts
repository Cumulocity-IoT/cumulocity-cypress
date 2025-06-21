import { defineConfig } from "cypress";
import { configureC8yPlugin } from "../src/plugin";

import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";

import * as fs from "fs";

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:8080",
    setupNodeEvents(on, config) {
      const bundler = createBundler({
        plugins: [
          nodeModulesPolyfillPlugin({
            modules: {
              fs: true, // required for quicktype-core
              // Add other Node.js built-ins used by dependencies if needed
            },
          }),
        ],
        resolveExtensions: [".ts", ".js", ".mjs", ".cjs", ".json"],
        sourcemap: "inline",
      });

      on("file:preprocessor", bundler);

      configureC8yPlugin(on, config);

      on("after:screenshot", (details) => {
        // delete file
        if (details.path) {
          console.log("deleting screenshot", details.path);
          fs.unlinkSync(details.path);
        }
      });

      on("task", {
        debug: (message: string) => {
          console.log(message);
          return null;
        },
      });

      return config;
    },
  },
});

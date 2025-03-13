import { defineConfig } from "cypress";
import { configureC8yPlugin } from "../src/plugin";

import * as fs from "fs";

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:8080",
    setupNodeEvents(on, config) {
      configureC8yPlugin(on, config);

      on("after:screenshot", (details) => {
        // delete file
        if (details.path) {
          console.log("deleting screenshot", details.path);
          fs.unlinkSync(details.path);
        }
      });

      return config;
    },
  },
});

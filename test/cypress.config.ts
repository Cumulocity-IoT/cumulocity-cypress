import { defineConfig } from "cypress";
import { configureC8yPlugin } from "../src/plugin";

import * as fs from "fs";

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:8080",
    setupNodeEvents(on, config) {
      // credentials only configured in config.env (see env-credentials.cy.ts). With
      // exposeCredentials false, they are not exposed and read with cy.env().
      config.env.envcredentials_username = "envuser";
      config.env.envcredentials_password = "envpassword";
      configureC8yPlugin(on, config, { exposeCredentials: false });

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

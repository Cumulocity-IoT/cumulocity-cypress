import { defineConfig } from "cypress";
import { configureC8yScreenshotPlugin } from "../plugin";

import debug from "debug";
const log = debug("c8y:scrn:cypress");

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:4200",
    supportFile: false,
    video: false,
    setupNodeEvents(on, config) {
      configureC8yScreenshotPlugin(on, config);
      on("task", {
        "debug": (message: string) => {
          log(message);
          return null;
        }
      });
  
      return config;
    },
  },
});

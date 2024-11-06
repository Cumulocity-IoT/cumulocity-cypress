// use javascript instead of typescript to avoid typescript compilation
const { defineConfig } = require("cypress");
const { configureC8yScreenshotPlugin } = require("../../plugin");

const { debug } = require("debug");
const log = debug("c8y:scrn:cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:8080",
    supportFile: false,
    video: false,
    setupNodeEvents(on, config) {
      configureC8yScreenshotPlugin(on, config);
      return config;
    },
  },
});

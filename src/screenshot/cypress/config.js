// use javascript instead of typescript to avoid typescript compilation
const { defineConfig } = require("cypress");
const { configureC8yScreenshotPlugin } = require("../../plugin");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:8080",
    video: false,
    supportFile: "e2e.js",
    setupNodeEvents(on, config) {
      configureC8yScreenshotPlugin(on, config);
      return config;
    },
  },
});

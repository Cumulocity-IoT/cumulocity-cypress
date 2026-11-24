// use javascript instead of typescript to avoid typescript compilation

// @cypress/grep with all supported Cypress versions, see grep.ts
const { registerCypressGrep } = require("./../grep");
registerCypressGrep();

const { C8yScreenshotRunner } = require("./../runner");

// undefined is passed as config, so the runner will look for the configuration
// in the environment variables created by startup script.
const c8yscrn = new C8yScreenshotRunner(undefined);
c8yscrn.runSuite();

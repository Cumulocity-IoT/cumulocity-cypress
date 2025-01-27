import { defineConfig } from "cypress";
import {
  configureC8yPlugin,
  C8yPactDefaultFileAdapter,
} from "cumulocity-cypress/plugin";

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      const fixture =
        config.env.C8Y_PACT_FOLDER ||
        config.env.pactFolder ||
        config.fixturesFolder;

      const adapter = new C8yPactDefaultFileAdapter(`${fixture}`);
      config.env._pacts = adapter.readJsonFiles();

      const baseUrl = config.env.baseUrl || null;
      if (baseUrl) {
        config.baseUrl = baseUrl;
      }

      configureC8yPlugin(on, config);
      return config;
    },
  },
});

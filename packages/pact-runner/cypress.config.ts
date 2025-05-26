import { defineConfig } from "cypress";
import {
  configureC8yPlugin,
  C8yPactDefaultFileAdapter,
  resolvePactRefs,
} from "cumulocity-cypress/plugin";

import debug from "debug";
const log = debug("c8y:pact-runner");

module.exports = defineConfig({
  e2e: {
    async setupNodeEvents(on, config) {
      const fixture =
        config.env.C8Y_PACT_RUNNER_FOLDER ||
        config.env.C8Y_PACT_FOLDER ||
        config.env.pactFolder ||
        config.fixturesFolder;

      const javascriptEnabled = config.env.C8Y_PACT_RUNNER_JS_ENABLED ?? false;
      const adapter = new C8yPactDefaultFileAdapter(`${fixture}`, {
        enableJavaScript: javascriptEnabled,
      });

      let pacts = adapter.readPactFiles();
      if (!pacts || !Array.isArray(pacts) || pacts.length === 0) {
        throw new Error(`No pact files found in ${fixture}.`);
      }

      if (config.env.C8Y_PACT_RUNNER_TAGS) {
        log(
          `Filter enabled from C8Y_PACT_RUNNER_TAGS: ${config.env.C8Y_PACT_RUNNER_TAGS}`
        );
        config.env.grepTags = config.env.C8Y_PACT_RUNNER_TAGS;
      }

      if (config.env.C8Y_PACT_RUNNER_METHODS) {
        log(
          `Filter enabled from C8Y_PACT_RUNNER_METHODS: ${config.env.C8Y_PACT_RUNNER_METHODS}`
        );
      }

      if (config.env.C8Y_PACT_RUNNER_PATHS) {
        log(
          `Filter enabled from C8Y_PACT_RUNNER_PATHS: ${config.env.C8Y_PACT_RUNNER_PATHS}`
        );
      }

      log(`Found ${pacts.length} pact files to process.`);

      pacts = await Promise.all(
        pacts.map(async (item) => {
          if (item.includes('"$ref"')) {
            log(`Resolving refs`);
            try {
              const result = await resolvePactRefs(
                item,
                adapter?.getFolder(),
                log
              );
              return result;
            } catch (e: any) {
              log(`Error resolving pact: ${e.message}`);
            }
            log(`Returning original document due to error dereferencing refs.`);
          } else {
            log(`No refs to resolve for pact: ${item}`);
          }
          return item;
        })
      );
      config.env._pacts = pacts;

      const baseUrl =
        config.env.baseUrl || config.env.C8Y_PACT_RUNNER_BASEURL || null;
      if (baseUrl) {
        log(`Setting baseUrl to ${baseUrl}`);
        config.baseUrl = baseUrl;
      }

      configureC8yPlugin(on, config);
      return config;
    },
  },
});

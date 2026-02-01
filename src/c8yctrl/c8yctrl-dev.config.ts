import {
  C8yDefaultPact,
  C8yPactHttpController,
  C8yPactHttpControllerConfig,
  C8yPactHttpResponse,
  C8yPactRecord,
} from "cumulocity-cypress/c8yctrl";
import { Request } from "express";

// import { C8yPactDefaultFileAdapter } from "cumulocity-cypress/plugin";
import { C8yPactHARFileAdapter } from "cumulocity-cypress/shared/c8ypact/adapter/haradapter";

export default (config: C8yPactHttpControllerConfig) => {
  config.adapter = new C8yPactHARFileAdapter("myrecordings");

  const createEmptyPact = () => {
    return new C8yDefaultPact(
      [],
      {
        id: "dtm_api_tests",
        baseUrl: config.baseUrl!,
        requestMatching: {
          ignoreUrlParameters: ["dateFrom", "dateTo", "_", "nocache"],
        },
      },
      "dtm_api_tests"
    );
  };

  config.on.beforeStart = (controller: C8yPactHttpController) => {
    if (controller.currentPact) return;

    if (controller.isMockingEnabled()) {
      const pact = controller.adapter?.loadPact("dtm_api_tests");
      if (pact) {
        controller.currentPact = new C8yDefaultPact(
          pact.records,
          pact.info,
          pact.id
        );
        return;
      } else {
        config.logger?.warn(
          "Could not find pact 'dtm_api_tests', starting with empty pact."
        );
      }
    }
    controller.currentPact = createEmptyPact();
  };

  config.on.mockRequest = (
    ctrl: C8yPactHttpController,
    req: Request,
    record: C8yPactRecord | null | undefined
  ): C8yPactHttpResponse | undefined => {
    if (record && record.response) {
      ctrl.logger?.info(
        `Mocking request: ${req.method} ${req.url} -> ${record.response.status} ${record.response.statusText || ""}`.trim()
      );
      return record.response;
    }
    ctrl.logger?.info(
      `Mocking request: ${req.method} ${req.url} -> no matching record`.trim()
    );
    return undefined;
  };

  // Example: Custom proxy options to reroute certain requests
  // config.proxyOptions = {
  //   router: (req) => {
  //     if (req.url && req.url.startsWith("/service/dtm/")) {
  //       config.logger?.warn(`Rerouting ${req.url} to localhost:8081`);
  //       return "http://localhost:8081";
  //     }
  //     return config.baseUrl;
  //   },

  //   // Optional: Remove the /service/dtm prefix when forwarding
  //   pathRewrite: (path) => {
  //     if (path.startsWith("/service/dtm/")) {
  //       config.logger?.warn(`Rewriting path ${path} to remove /service/dtm prefix`);
  //       return path.replace(/^\/service\/dtm/, "/");
  //     }
  //     return path;
  //   },
  // };

  /**
   * onProxyResponse is used to filter out requests that are already recorded. This is to avoid
   * recording the same request multiple times.
   */
  config.on.proxyResponse = (
    ctrl: C8yPactHttpController,
    req: Request,
    res: C8yPactHttpResponse
  ) => {
    // filter out requests that are already recorded
    const record = ctrl.currentPact?.nextRecordMatchingRequest(
      req,
      config.baseUrl
    );
    if (record) {
      res.headers = res.headers || {};
      res.headers["x-c8yctrl-type"] = "duplicate";
    }
    return record == null;
  };

  return config;
};

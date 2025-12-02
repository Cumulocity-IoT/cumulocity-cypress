import {
  C8yPactHttpController,
  C8yPactHttpControllerConfig,
  C8yPactHttpResponse,
} from "cumulocity-cypress/c8yctrl";

import { Request } from "express";

export default (config: C8yPactHttpControllerConfig) => {
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

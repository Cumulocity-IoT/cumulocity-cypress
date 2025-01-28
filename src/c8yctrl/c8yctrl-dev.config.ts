import {
  C8yPactHttpController,
  C8yPactHttpControllerConfig,
  C8yPactHttpResponse,
} from "cumulocity-cypress/shared/c8yctrl";

import { Request } from "express";

export default (config: C8yPactHttpControllerConfig) => {
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
};

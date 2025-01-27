/// <reference types="jest" />

import { RequestHandler } from "express";
import { addC8yCtrlHeader, wrapPathIgnoreHandler } from "./middleware";
import { C8yCtrlHeader, C8yPactHttpResponse } from "./httpcontroller-options";

describe("middleware", () => {
  describe("wrapPathIgnoreHandler", () => {
    it("should invoke the handler for non-ignored paths", () => {
      const ignoredPaths = ["/ignored"];
      const testHandler: RequestHandler = (req: any, res: any) => {
        res.end("Handler was called");
      };
      const ignoreHandler: RequestHandler = wrapPathIgnoreHandler(
        testHandler,
        ignoredPaths
      );

      const next = jest.fn();
      const req: any = { path: "/not-ignored" };
      const res: any = { end: jest.fn() };
      ignoreHandler(req, res, next);
      expect(res.end).toHaveBeenCalledWith("Handler was called");
      expect(next).not.toHaveBeenCalled();
    });

    it("should call next() immediately for ignored paths", () => {
      const ignoredPaths = ["/ignored"];
      const testHandler = jest.fn();
      const ignoreHandler: RequestHandler = wrapPathIgnoreHandler(
        testHandler,
        ignoredPaths
      );

      const req: any = { path: "/ignored" };
      const res: any = {};
      const next = jest.fn();
      ignoreHandler(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(testHandler).not.toHaveBeenCalled();
    });

    it("should invoke next for ignore paths", () => {
      const ignoredPaths = ["/ignored"];
      const next: jest.Mock = jest.fn();
      const testHandler = (req: any, res: any) => {
        res.end("Handler was called");
      };

      const ignoreHandler = wrapPathIgnoreHandler(testHandler, ignoredPaths);
      const req: any = { path: "/ignored" };
      const res: any = { end: jest.fn() };

      ignoreHandler(req, res, next);

      expect(res.end).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe("addC8yCtrlHeader", () => {
    it("should add the C8yCtrlHeader to the response if it doesn't exist", () => {
      const response: C8yPactHttpResponse = {
        headers: {},
        status: 200,
        statusText: "OK",
        body: "Response body",
      };
      const ctrlHeader: C8yCtrlHeader = "x-c8yctrl-mode";
      const value = "test-mode";

      addC8yCtrlHeader(response, ctrlHeader, value);

      expect(response.headers).toEqual({ [ctrlHeader]: value });
    });

    it("should not add the C8yCtrlHeader to the response if it already exists", () => {
      const response: C8yPactHttpResponse = {
        headers: { "x-c8yctrl-mode": "existing-mode" },
        status: 200,
        statusText: "OK",
        body: "Response body",
      };
      const ctrlHeader: C8yCtrlHeader = "x-c8yctrl-mode";
      const value = "test-mode";

      addC8yCtrlHeader(response, ctrlHeader, value);

      expect(response.headers).toEqual({ [ctrlHeader]: "existing-mode" });
    });

    it("should add the C8yCtrlHeader to the Response object if it doesn't exist", () => {
      const response: { hasHeader: () => boolean; setHeader: () => void } = {
        hasHeader: () => false,
        setHeader: jest.fn(),
      };
      const ctrlHeader: C8yCtrlHeader = "x-c8yctrl-mode";
      const value = "test-mode";

      addC8yCtrlHeader(response as any, ctrlHeader, value);

      expect(response.setHeader).toHaveBeenCalledWith(ctrlHeader, value);
    });

    it("should not add the C8yCtrlHeader to the Response object if it already exists", () => {
      const response: {
        headers: any;
        hasHeader: () => boolean;
        setHeader: () => void;
      } = {
        headers: { "x-c8yctrl-mode": "existing-mode" } as any,
        hasHeader: () => true,
        setHeader: jest.fn(),
      };
      const ctrlHeader: C8yCtrlHeader = "x-c8yctrl-mode";
      const value = "test-mode";

      addC8yCtrlHeader(response as any, ctrlHeader, value);

      expect(response.setHeader).not.toHaveBeenCalled();
    });

    it("should not add the C8yCtrlHeader to the Response object does not have setHeader method or headers property", () => {
      const response: any = {};
      const ctrlHeader: C8yCtrlHeader = "x-c8yctrl-mode";

      addC8yCtrlHeader(response, ctrlHeader, "test-value");

      expect(response).toEqual({});
    });
  });
});

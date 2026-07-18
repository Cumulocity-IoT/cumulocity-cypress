import {
  evaluateSelfHealAttempt,
  driveSelfHealLoop,
  type SelfHealVerdict,
  type AttemptRunResult,
} from "./selfHeal.js";
import { AgentLoopError } from "./agentLoop.js";
import type { CypressRunResult } from "../cypress/cypressRunner.js";
import type { AssertionTraceResult } from "../assertion/assertionTraceChecker.js";

const PASS: CypressRunResult = { pass: true, testFailures: [], specFailures: [] };
const OK_TRACE: AssertionTraceResult = { ok: true, unmatched: [] };

describe("evaluateSelfHealAttempt", () => {
  it("reports healed when the assertion trace is ok and Cypress passes", () => {
    const verdict = evaluateSelfHealAttempt({
      cypressResult: PASS,
      assertionTrace: OK_TRACE,
      attempt: 1,
      maxAttempts: 3,
    });
    expect(verdict).toEqual({ status: "healed" });
  });

  it("retries when the assertion trace fails but Cypress passes, and attempts remain", () => {
    const verdict = evaluateSelfHealAttempt({
      cypressResult: PASS,
      assertionTrace: { ok: false, unmatched: ["Outcome A", "Outcome B"] },
      attempt: 1,
      maxAttempts: 3,
    });
    expect(verdict.status).toBe("retry");
    expect((verdict as { feedback: string }).feedback).toContain("Outcome A");
    expect((verdict as { feedback: string }).feedback).toContain("Outcome B");
    expect((verdict as { feedback: string }).feedback).toContain("Assertion-trace check failed");
  });

  it("retries when Cypress fails but the assertion trace is ok, and attempts remain", () => {
    const cypressResult: CypressRunResult = {
      pass: false,
      testFailures: [
        { title: ["suite", "test"], errorMessage: "expected 2 to equal 3", screenshotPath: "/tmp/shot.png" },
      ],
      specFailures: [],
    };
    const verdict = evaluateSelfHealAttempt({
      cypressResult,
      assertionTrace: OK_TRACE,
      attempt: 1,
      maxAttempts: 3,
    });
    expect(verdict.status).toBe("retry");
    const feedback = (verdict as { feedback: string }).feedback;
    expect(feedback).toContain("Cypress run failed");
    expect(feedback).toContain("suite > test");
    expect(feedback).toContain("expected 2 to equal 3");
    expect(feedback).toContain("/tmp/shot.png");
  });

  it("includes both problems in the feedback when both checks fail", () => {
    const cypressResult: CypressRunResult = {
      pass: false,
      testFailures: [],
      specFailures: [{ specRelativePath: "cypress/e2e/x.cy.ts", errorMessage: "boom" }],
    };
    const verdict = evaluateSelfHealAttempt({
      cypressResult,
      assertionTrace: { ok: false, unmatched: ["Outcome A"] },
      attempt: 1,
      maxAttempts: 3,
    });
    expect(verdict.status).toBe("retry");
    const feedback = (verdict as { feedback: string }).feedback;
    expect(feedback).toContain("Assertion-trace check failed");
    expect(feedback).toContain("Outcome A");
    expect(feedback).toContain("Cypress run failed");
    expect(feedback).toContain("boom");
  });

  it("reports exhausted (not retry) once the attempt budget is used up", () => {
    const verdict = evaluateSelfHealAttempt({
      cypressResult: PASS,
      assertionTrace: { ok: false, unmatched: ["Outcome A"] },
      attempt: 3,
      maxAttempts: 3,
    });
    expect(verdict.status).toBe("exhausted");
  });
});

describe("driveSelfHealLoop", () => {
  function fakeAttempt(label: string, priorMessages: unknown[]): AttemptRunResult {
    return {
      finalMessage: `final-${label}` as unknown as AttemptRunResult["finalMessage"],
      messages: [
        ...(priorMessages as AttemptRunResult["messages"]),
        { role: "assistant", content: `assistant-turn-${label}` },
      ],
    };
  }

  it("stops after one attempt when evaluateAttempt reports healed immediately", async () => {
    const runAttempt = jest.fn(async (messages: unknown[]) => fakeAttempt("1", messages));
    const evaluateAttempt = jest.fn(async (): Promise<SelfHealVerdict> => ({ status: "healed" }));

    const result = await driveSelfHealLoop({
      initialMessages: [{ role: "user", content: "task" }],
      maxAttempts: 3,
      runAttempt,
      evaluateAttempt,
    });

    expect(result.attempts).toBe(1);
    expect(result.verdict).toEqual({ status: "healed" });
    expect(runAttempt).toHaveBeenCalledTimes(1);
  });

  it("feeds the retry feedback back as the next user turn and continues the same message history", async () => {
    let attemptCounter = 0;
    const runAttempt = jest.fn(async (messages: unknown[]) => {
      attemptCounter++;
      return fakeAttempt(String(attemptCounter), messages);
    });
    const evaluateAttempt = jest.fn(async (attempt: number): Promise<SelfHealVerdict> =>
      attempt === 1
        ? { status: "retry", feedback: "please fix the time assertion" }
        : { status: "healed" }
    );

    const result = await driveSelfHealLoop({
      initialMessages: [{ role: "user", content: "task" }],
      maxAttempts: 3,
      runAttempt,
      evaluateAttempt,
    });

    expect(result.attempts).toBe(2);
    expect(runAttempt).toHaveBeenCalledTimes(2);

    const secondCallMessages = runAttempt.mock.calls[1][0] as Array<{
      role: string;
      content: unknown;
    }>;
    // second attempt's messages = first attempt's full history + the retry feedback turn
    expect(secondCallMessages[0]).toEqual({ role: "user", content: "task" });
    expect(secondCallMessages[1]).toEqual({
      role: "assistant",
      content: "assistant-turn-1",
    });
    expect(secondCallMessages[2]).toEqual({
      role: "user",
      content: "please fix the time assertion",
    });
  });

  it("stops at exhausted after maxAttempts without exceeding the bound", async () => {
    let attemptCounter = 0;
    const runAttempt = jest.fn(async (messages: unknown[]) => {
      attemptCounter++;
      return fakeAttempt(String(attemptCounter), messages);
    });
    const evaluateAttempt = jest.fn(async (attempt: number): Promise<SelfHealVerdict> =>
      attempt >= 2 ? { status: "exhausted", feedback: "still broken" } : { status: "retry", feedback: "try again" }
    );

    const result = await driveSelfHealLoop({
      initialMessages: [{ role: "user", content: "task" }],
      maxAttempts: 2,
      runAttempt,
      evaluateAttempt,
    });

    expect(result.attempts).toBe(2);
    expect(result.verdict).toEqual({ status: "exhausted", feedback: "still broken" });
    expect(runAttempt).toHaveBeenCalledTimes(2);
  });

  it("calls onAttempt once per attempt with the attempt number and verdict", async () => {
    const runAttempt = jest.fn(async (messages: unknown[]) => fakeAttempt("1", messages));
    const evaluateAttempt = jest.fn(async (): Promise<SelfHealVerdict> => ({ status: "healed" }));
    const onAttempt = jest.fn();

    await driveSelfHealLoop({
      initialMessages: [{ role: "user", content: "task" }],
      maxAttempts: 3,
      runAttempt,
      evaluateAttempt,
      onAttempt,
    });

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(1, { status: "healed" });
  });

  it("propagates an error thrown mid-attempt instead of returning a partial result", async () => {
    const runAttempt = jest.fn(async () => {
      throw new Error("network dropped");
    });
    const evaluateAttempt = jest.fn(async (): Promise<SelfHealVerdict> => ({ status: "healed" }));

    await expect(
      driveSelfHealLoop({
        initialMessages: [{ role: "user", content: "task" }],
        maxAttempts: 3,
        runAttempt,
        evaluateAttempt,
      })
    ).rejects.toThrow("network dropped");
    expect(evaluateAttempt).not.toHaveBeenCalled();
  });

  it("throws AgentLoopError if evaluateAttempt never returns healed/exhausted within maxAttempts", async () => {
    let attemptCounter = 0;
    const runAttempt = jest.fn(async (messages: unknown[]) => {
      attemptCounter++;
      return fakeAttempt(String(attemptCounter), messages);
    });
    const evaluateAttempt = jest.fn(async (): Promise<SelfHealVerdict> => ({
      status: "retry",
      feedback: "still trying",
    }));

    await expect(
      driveSelfHealLoop({
        initialMessages: [{ role: "user", content: "task" }],
        maxAttempts: 2,
        runAttempt,
        evaluateAttempt,
      })
    ).rejects.toBeInstanceOf(AgentLoopError);
    expect(runAttempt).toHaveBeenCalledTimes(2);
  });
});

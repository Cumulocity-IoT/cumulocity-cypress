import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  evaluateSelfHealAttempt,
  driveSelfHealLoop,
  moveMessageCacheBreakpoint,
  loadScreenshotImageBlocks,
  type SelfHealVerdict,
  type AttemptRunResult,
  type CacheableBlock,
} from "./selfHeal.js";
import { AgentLoopError } from "./agentLoop.js";
import type { CypressRunResult } from "../cypress/cypressRunner.js";
import type { AssertionTraceResult } from "../assertion/assertionTraceChecker.js";
import type Anthropic from "@anthropic-ai/sdk";

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

  it("attaches images as a text+image content array when the retry verdict carries them", async () => {
    const imageBlock: Anthropic.Beta.Messages.BetaImageBlockParam = {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "ZmFrZQ==" },
    };
    const runAttempt = jest.fn(async (messages: unknown[]) => fakeAttempt("1", messages));
    const evaluateAttempt = jest.fn(async (attempt: number): Promise<SelfHealVerdict> =>
      attempt === 1
        ? { status: "retry", feedback: "found 1, expected 9 - see screenshot", images: [imageBlock] }
        : { status: "healed" }
    );

    const result = await driveSelfHealLoop({
      initialMessages: [{ role: "user", content: "task" }],
      maxAttempts: 3,
      runAttempt,
      evaluateAttempt,
    });

    expect(result.attempts).toBe(2);
    const secondCallMessages = runAttempt.mock.calls[1][0] as Array<{
      role: string;
      content: unknown;
    }>;
    expect(secondCallMessages[2]).toEqual({
      role: "user",
      content: [{ type: "text", text: "found 1, expected 9 - see screenshot" }, imageBlock],
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

describe("moveMessageCacheBreakpoint", () => {
  function countMarkedBlocks(messages: Anthropic.Beta.Messages.BetaMessageParam[]): number {
    let count = 0;
    for (const message of messages) {
      if (typeof message.content === "string") continue;
      for (const block of message.content) {
        if ((block as CacheableBlock).cache_control) count++;
      }
    }
    return count;
  }

  it("marks the last block of the last message", () => {
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      { role: "user", content: "explore the app" },
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "browser_navigate", input: {} }],
      },
    ];

    const marked = moveMessageCacheBreakpoint(messages, undefined);

    const lastBlock = (messages[1]!.content as Anthropic.Beta.Messages.BetaContentBlockParam[])[0]!;
    expect((lastBlock as CacheableBlock).cache_control).toEqual({ type: "ephemeral" });
    expect(marked).toBe(lastBlock);
    expect(countMarkedBlocks(messages)).toBe(1);
  });

  it("clears the previous marker when moving to a new one, keeping exactly one live", () => {
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      { role: "user", content: "task" },
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "browser_navigate", input: {} }],
      },
    ];
    let marked = moveMessageCacheBreakpoint(messages, undefined);
    expect(countMarkedBlocks(messages)).toBe(1);

    // Simulate the runner appending the tool result, then a new assistant turn.
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
    });
    messages.push({
      role: "assistant",
      content: [{ type: "tool_use", id: "t2", name: "browser_click", input: {} }],
    });

    marked = moveMessageCacheBreakpoint(messages, marked);

    // The old marker (turn 1's tool_use) must be cleared, not just left in place.
    const firstAssistantBlock = (
      messages[1]!.content as Anthropic.Beta.Messages.BetaContentBlockParam[]
    )[0]!;
    expect((firstAssistantBlock as CacheableBlock).cache_control).toBeUndefined();

    const newLastBlock = (
      messages[3]!.content as Anthropic.Beta.Messages.BetaContentBlockParam[]
    )[0]!;
    expect((newLastBlock as CacheableBlock).cache_control).toEqual({ type: "ephemeral" });
    expect(marked).toBe(newLastBlock);
    expect(countMarkedBlocks(messages)).toBe(1);
  });

  it("stays at exactly one live marker across many simulated turns", () => {
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      { role: "user", content: "task" },
    ];
    let marked: CacheableBlock | undefined;

    for (let turn = 0; turn < 10; turn++) {
      messages.push({
        role: "assistant",
        content: [{ type: "tool_use", id: `t${turn}`, name: "browser_navigate", input: {} }],
      });
      marked = moveMessageCacheBreakpoint(messages, marked);
      expect(countMarkedBlocks(messages)).toBe(1);

      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: `t${turn}`, content: "ok" }],
      });
      marked = moveMessageCacheBreakpoint(messages, marked);
      expect(countMarkedBlocks(messages)).toBe(1);
    }
  });

  it("leaves the marker unchanged when the last message has plain string content", () => {
    const priorBlock: CacheableBlock = { cache_control: { type: "ephemeral" } };
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      { role: "user", content: "a follow-up as plain text" },
    ];

    const marked = moveMessageCacheBreakpoint(messages, priorBlock);

    expect(marked).toBe(priorBlock);
    expect(priorBlock.cache_control).toEqual({ type: "ephemeral" });
  });

  it("leaves the marker unchanged when the last block is a thinking block", () => {
    const priorBlock: CacheableBlock = { cache_control: { type: "ephemeral" } };
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      {
        role: "assistant",
        content: [{ type: "thinking", thinking: "...", signature: "sig" }],
      },
    ];

    const marked = moveMessageCacheBreakpoint(messages, priorBlock);

    expect(marked).toBe(priorBlock);
    expect(priorBlock.cache_control).toEqual({ type: "ephemeral" });
  });

  it("does nothing and does not throw on an empty messages array", () => {
    const marked = moveMessageCacheBreakpoint([], undefined);
    expect(marked).toBeUndefined();
  });
});

describe("loadScreenshotImageBlocks", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "c8y-cygen-screenshot-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function resultWith(screenshotPaths: Array<string | undefined>): CypressRunResult {
    return {
      pass: false,
      testFailures: screenshotPaths.map((screenshotPath, i) => ({
        title: [`test-${i}`],
        errorMessage: "boom",
        screenshotPath,
      })),
      specFailures: [],
    };
  }

  it("loads a screenshot as a base64 image block", async () => {
    const shotPath = path.join(dir, "shot.png");
    await writeFile(shotPath, Buffer.from("fake-png-bytes"));

    const blocks = loadScreenshotImageBlocks(resultWith([shotPath]));

    expect(blocks).toEqual([
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: Buffer.from("fake-png-bytes").toString("base64"),
        },
      },
    ]);
  });

  it("skips failures with no screenshotPath", async () => {
    expect(loadScreenshotImageBlocks(resultWith([undefined]))).toEqual([]);
  });

  it("silently skips a screenshotPath that doesn't resolve to a real file", async () => {
    const blocks = loadScreenshotImageBlocks(resultWith([path.join(dir, "missing.png")]));
    expect(blocks).toEqual([]);
  });

  it("caps at MAX_SCREENSHOTS_PER_RETRY even when more failures have screenshots", async () => {
    const paths = await Promise.all(
      [0, 1, 2].map(async (i) => {
        const p = path.join(dir, `shot${i}.png`);
        await writeFile(p, Buffer.from(`bytes-${i}`));
        return p;
      })
    );

    const blocks = loadScreenshotImageBlocks(resultWith(paths));

    expect(blocks).toHaveLength(2);
    expect((blocks[0].source as { data: string }).data).toEqual(
      Buffer.from("bytes-0").toString("base64")
    );
    expect((blocks[1].source as { data: string }).data).toEqual(
      Buffer.from("bytes-1").toString("base64")
    );
  });
});

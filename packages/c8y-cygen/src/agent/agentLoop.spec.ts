import { runToolRunnerToCompletion, AgentLoopError } from "./agentLoop.js";

/**
 * client.beta.messages.toolRunner(...) returns a BetaToolRunner - an async
 * iterable that yields one message per turn of the real loop (assistant
 * response -> tool execution -> tool results fed back -> next turn). These
 * tests stand in a fake async-iterable in its place, so runToolRunnerToCompletion's
 * consumption logic (the part that actually drives that loop) is verified
 * without any Anthropic API call.
 */
async function* fakeRunner<T>(messages: T[]): AsyncGenerator<T> {
  for (const message of messages) {
    yield message;
  }
}

describe("runToolRunnerToCompletion", () => {
  it("iterates every message the runner yields, in order", async () => {
    const seen: string[] = [];
    const finalMessage = await runToolRunnerToCompletion(
      fakeRunner(["turn-1", "turn-2", "turn-3"]),
      (message) => seen.push(message)
    );

    expect(seen).toEqual(["turn-1", "turn-2", "turn-3"]);
    expect(finalMessage).toBe("turn-3");
  });

  it("works with no onMessage callback", async () => {
    const finalMessage = await runToolRunnerToCompletion(
      fakeRunner(["only-turn"])
    );
    expect(finalMessage).toBe("only-turn");
  });

  it("throws AgentLoopError if the runner yields nothing", async () => {
    await expect(runToolRunnerToCompletion(fakeRunner([]))).rejects.toThrow(
      AgentLoopError
    );
  });

  it("propagates an error thrown mid-iteration instead of returning a partial result", async () => {
    async function* throwingRunner() {
      yield "turn-1";
      throw new Error("network dropped");
    }

    await expect(runToolRunnerToCompletion(throwingRunner())).rejects.toThrow(
      "network dropped"
    );
  });
});

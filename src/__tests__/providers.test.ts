import { describe, it, expect, vi } from "vitest";
import {
  DeepSeekProvider,
  OpenAIProvider,
  OpenRouterProvider,
  VALID_PROVIDER_NAMES,
  createProvider,
  type LlmProvider,
} from "../providers/index.ts";

vi.mock("openai", () => {
  const create = vi.fn();
  class MockOpenAI {
    chat = { completions: { create } };
  }
  return {
    default: MockOpenAI,
    __mockCreate: create,
  };
});

async function getOpenAIMockCreate() {
  const mod = await import("openai");
  return (mod as unknown as { __mockCreate: ReturnType<typeof vi.fn> }).__mockCreate;
}

describe("Llm providers", () => {
  it("keeps only local-news supported providers", () => {
    expect(VALID_PROVIDER_NAMES).toEqual(["openai", "openrouter", "deepseek"]);
  });

  it("providers implement the interface", () => {
    const providers: LlmProvider[] = [
      new OpenAIProvider({ apiKey: "k" }),
      new OpenRouterProvider({ apiKey: "k" }),
      new DeepSeekProvider("k"),
    ];

    for (const provider of providers) {
      expect(typeof provider.name).toBe("string");
      expect(typeof provider.call).toBe("function");
    }
  });

  it("defaults to openai", () => {
    delete process.env["LLM_PROVIDER"];
    expect(createProvider().name).toBe("openai");
  });

  it("creates configured providers", () => {
    expect(createProvider("openai").name).toBe("openai");
    expect(createProvider("openrouter").name).toBe("openrouter");
    expect(createProvider("deepseek").name).toBe("deepseek");
  });

  it("throws for invalid providers", () => {
    expect(() => createProvider("anthropic" as never)).toThrow("Invalid LLM provider");
  });

  it("OpenAI-compatible calls return message content", async () => {
    const mockCreate = await getOpenAIMockCreate();
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: "ok" } }] });

    const provider = new OpenAIProvider({ apiKey: "k", model: "gpt-test" });
    await expect(provider.call("prompt", 123)).resolves.toBe("ok");
  });
});

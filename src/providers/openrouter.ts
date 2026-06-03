/**
 * OpenRouter provider — OpenAI-compatible endpoint via openrouter.ai.
 *
 * Env vars:
 *   OPENROUTER_API_KEY  - API key
 *   OPENROUTER_MODEL    - model name (default: openai/gpt-4o-mini)
 */

import { OpenAICompatibleProvider } from "./openai-compatible.ts";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export class OpenRouterProvider extends OpenAICompatibleProvider {
  readonly name = "openrouter";

  constructor(opts?: { apiKey?: string; model?: string }) {
    super({
      apiKey: opts?.apiKey ?? process.env["OPENROUTER_API_KEY"],
      baseURL: OPENROUTER_BASE_URL,
      model: opts?.model ?? process.env["OPENROUTER_MODEL"] ?? "openai/gpt-4o-mini",
    });
  }
}

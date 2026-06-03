import { OpenAICompatibleProvider } from "./openai-compatible.ts";

export class DeepSeekProvider extends OpenAICompatibleProvider {
  readonly name = "deepseek";

  constructor(apiKey = process.env["DEEPSEEK_API_KEY"], model = process.env["DEEPSEEK_MODEL"]) {
    super({
      apiKey,
      baseURL: "https://api.deepseek.com",
      model: model ?? "deepseek-chat",
    });
  }
}

import OpenAI from "openai";
import { getEnv } from "./config";

let client: OpenAI | null = null;

export function getOpenAIClient() {
  if (!client) {
    const env = getEnv();
    client = new OpenAI({
      apiKey: env.OPENAI_API_KEY
    });
  }

  return client;
}

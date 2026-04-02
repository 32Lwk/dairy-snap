import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY が設定されていません");
  }
  if (!client) {
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

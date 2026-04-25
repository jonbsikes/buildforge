import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";

const client = new Anthropic();

export const EXTRACT_MODEL = "claude-sonnet-4-6";

export type ExtractResult<T> =
  | { ok: true; data: T; usage: Anthropic.Messages.Usage }
  | { ok: false; error: string; status: number };

export interface ExtractStructuredArgs {
  systemPrompt: string;
  content: ContentBlockParam[];
  maxTokens?: number;
}

export async function extractStructured<T>({
  systemPrompt,
  content,
  maxTokens = 2048,
}: ExtractStructuredArgs): Promise<ExtractResult<T>> {
  let message: Anthropic.Messages.Message;
  try {
    message = await client.messages.create({
      model: EXTRACT_MODEL,
      max_tokens: maxTokens,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Claude API call failed";
    return { ok: false, error: msg, status: 502 };
  }

  const first = message.content[0];
  const text = first && first.type === "text" ? first.text : "";
  // Extract content between markdown fences if present, otherwise use raw text
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const cleaned = (fenceMatch ? fenceMatch[1] : text).trim();

  let data: T;
  try {
    data = JSON.parse(cleaned) as T;
  } catch {
    return { ok: false, error: "Failed to parse AI response", status: 500 };
  }

  return { ok: true, data, usage: message.usage };
}

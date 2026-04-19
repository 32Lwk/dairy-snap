import { APIError } from "openai";

/**
 * Detect errors where retrying with a different model id may succeed (unknown model, etc.).
 * Does not match rate limits (429) — retrying another model rarely helps.
 */
export function isOpenAiChatModelUnavailableError(err: unknown): boolean {
  if (err instanceof APIError) {
    if (err.status === 404) return true;
    const code = (err as APIError & { code?: string }).code;
    if (code === "model_not_found") return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /model_not_found|does not exist|invalid_model|unsupported model|unknown model/i.test(msg);
}

export async function withChatModelFallback<T>(
  primary: string,
  fallback: string | null | undefined,
  run: (model: string) => Promise<T>,
): Promise<T> {
  try {
    return await run(primary);
  } catch (e) {
    if (fallback && fallback !== primary && isOpenAiChatModelUnavailableError(e)) {
      return await run(fallback);
    }
    throw e;
  }
}

/** Same as withChatModelFallback but returns which model id was used (for audit logs). */
export async function withChatModelFallbackAndModel<T>(
  primary: string,
  fallback: string | null | undefined,
  run: (model: string) => Promise<T>,
): Promise<{ result: T; model: string }> {
  try {
    const result = await run(primary);
    return { result, model: primary };
  } catch (e) {
    if (fallback && fallback !== primary && isOpenAiChatModelUnavailableError(e)) {
      const result = await run(fallback);
      return { result, model: fallback };
    }
    throw e;
  }
}

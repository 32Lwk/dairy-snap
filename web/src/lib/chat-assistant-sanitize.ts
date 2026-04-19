/**
 * Strip assistant outputs that echo system / instruction text (common on opening turns).
 * Prefix-only: does not alter mid-message parentheticals.
 */

const LEADING_META_PAREN = /^（[^）]{1,500}）/;

function innerLooksLikeInstructionEcho(inner: string): boolean {
  if (/会話はまだ/.test(inner)) return true;
  if (/プロンプト/.test(inner)) return true;
  if (/メタ(説明|情報|文|発話)/.test(inner) || /メタな/.test(inner)) return true;
  if (/システム/.test(inner) && (/生成|返答|続けて|指示/.test(inner) || /短い/.test(inner))) return true;
  if (/^では[:：．。…\s]*$/u.test(inner)) return true;
  return false;
}

/** While the buffer looks like an unfinished “（システム…）” style leak, suppress streaming. */
export function shouldHoldUnclosedMetaParenPrefix(raw: string): boolean {
  const t = raw.trimStart();
  if (!t.startsWith("（")) return false;
  if (t.includes("）")) return false;
  const inner = t.slice(1);
  if (inner.length > 200) return false;
  return /^(システム|指示|プロンプト|メタ説|メタ文|メタ発|では)/.test(inner);
}

export function stripAssistantMetaEchoPrefix(text: string): string {
  let s = text;
  for (let i = 0; i < 8; i++) {
    const trimmed = s.trimStart();
    const m = trimmed.match(LEADING_META_PAREN);
    if (!m) break;
    const inner = m[0].slice(1, -1);
    if (!innerLooksLikeInstructionEcho(inner)) break;
    s = trimmed.slice(m[0].length);
  }
  return s;
}

/**
 * Maps raw model accumulation to user-visible streaming text.
 * When {@link shouldHoldUnclosedMetaParenPrefix} is true, keeps the previous displayed string.
 */
export function computeAssistantStreamDelta(
  rawAccumulated: string,
  prevDisplayed: string,
): { displayedFull: string; outDelta: string } {
  if (shouldHoldUnclosedMetaParenPrefix(rawAccumulated)) {
    return { displayedFull: prevDisplayed, outDelta: "" };
  }
  const displayedFull = stripAssistantMetaEchoPrefix(rawAccumulated);
  return { displayedFull, outDelta: displayedFull.slice(prevDisplayed.length) };
}

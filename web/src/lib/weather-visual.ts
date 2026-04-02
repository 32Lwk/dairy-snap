/** WMO Weather interpretation (Open-Meteo) → 絵文字・簡易トーン */

export function weatherEmojiForCode(code: number | null): string {
  if (code == null) return "❔";
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 55) return "🌦️";
  if (code >= 56 && code <= 57) return "🌨️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code >= 85 && code <= 86) return "🌨️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "🌡️";
}

/** カード背景・枠のトーン（Tailwind class 断片） */
export function weatherCardToneClass(code: number | null): string {
  if (code == null) {
    return "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50";
  }
  if (code === 0) {
    return "border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50 dark:border-amber-900/50 dark:from-amber-950/60 dark:to-orange-950/40";
  }
  if (code <= 3) {
    return "border-sky-200/80 bg-gradient-to-br from-sky-50 to-zinc-100 dark:border-sky-900/40 dark:from-sky-950/50 dark:to-zinc-900/60";
  }
  if (code === 45 || code === 48) {
    return "border-zinc-300/80 bg-zinc-100/90 dark:border-zinc-600 dark:bg-zinc-800/70";
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return "border-blue-200/90 bg-gradient-to-br from-blue-50 to-indigo-50 dark:border-blue-900/50 dark:from-blue-950/50 dark:to-indigo-950/40";
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return "border-slate-200/90 bg-gradient-to-br from-slate-100 to-blue-50 dark:border-slate-700 dark:from-slate-900/70 dark:to-blue-950/40";
  }
  if (code >= 95) {
    return "border-violet-300/80 bg-gradient-to-br from-violet-100 to-slate-100 dark:border-violet-900/50 dark:from-violet-950/50 dark:to-slate-900/60";
  }
  return "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50";
}

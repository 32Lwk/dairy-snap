/**
 * AI との距離感・生活リズム・話題の境界（プロフィール用）
 * 値は API / DB に保存する安定キー（表示ラベルは別）
 */

export const AI_ADDRESS_STYLE_OPTIONS = [
  { value: "", label: "選ばない" },
  { value: "nickname", label: "ニックネームで呼ぶ" },
  { value: "san", label: "さん付け" },
  { value: "tame_light", label: "タメ口寄り" },
  { value: "neutral", label: "特に指定しない（中立）" },
] as const;

export const AI_CHAT_TONE_OPTIONS = [
  { value: "", label: "選ばない" },
  { value: "empathic", label: "共感・寄り添い多め" },
  { value: "factual", label: "事実整理・整理多め" },
  { value: "questions", label: "質問で深掘り" },
  { value: "brief", label: "短く要約・すっきり" },
  { value: "encouraging", label: "明るく励まし" },
] as const;

export const AI_DEPTH_LEVEL_OPTIONS = [
  { value: "", label: "選ばない" },
  { value: "light", label: "浅め（軽い話題中心）" },
  { value: "normal", label: "ふつう" },
  { value: "deep", label: "深め（本人のペース最優先）" },
] as const;

export const AI_ENERGY_PEAK_OPTIONS = [
  { value: "", label: "選ばない / バラバラ" },
  { value: "morning", label: "朝いちばん元気" },
  { value: "midday", label: "昼・日中" },
  { value: "evening", label: "夜（早め）" },
  { value: "night", label: "遅い時間・深夜" },
  { value: "irregular", label: "ほぼ一定しない" },
] as const;

/** 複数選択（該当がなければ未選択のままでよい） */
export const AI_BUSY_WINDOW_OPTIONS = [
  { value: "weekday_morning", label: "平日の朝が忙しい" },
  { value: "commute", label: "通勤・通学の時間帯" },
  { value: "late_night", label: "夜遅くまで動く" },
  { value: "weekend_heavy", label: "土日が忙しい" },
  { value: "shift_irregular", label: "シフトで不規則" },
] as const;

export const AI_AVOID_TOPIC_OPTIONS = [
  { value: "romance", label: "恋愛" },
  { value: "health_medical", label: "健康・病気の詳細" },
  { value: "religion_politics", label: "宗教・政治" },
  { value: "appearance_diet", label: "外見・ダイエット" },
  { value: "family_detail", label: "家族の内密な話" },
  { value: "work_confidential", label: "職場の機密・細部" },
  { value: "money_detail", label: "家計・お金の細かい話" },
  { value: "none", label: "特に避けたい話題はない" },
] as const;

/** 条件付きで追加表示（世帯・職業に応じて） */
export const AI_AVOID_TOPIC_EXTRA: {
  value: string;
  label: string;
  when: (ctx: { occupationRole?: string; aiHousehold?: string }) => boolean;
}[] = [
  {
    value: "school_bully_grade",
    label: "学校のいじめ・成績の細部",
    when: ({ occupationRole }) => occupationRole === "student",
  },
  {
    value: "parenting_care_load",
    label: "育児・介護の負担の細部",
    when: ({ aiHousehold }) =>
      aiHousehold === "kids" || aiHousehold === "parents" || aiHousehold === "mixed",
  },
  {
    value: "overtime_deadline",
    label: "残業・締切の細かい業務内容",
    when: ({ occupationRole }) =>
      occupationRole != null && occupationRole !== "" && occupationRole !== "student",
  },
];

/** チップ表示用：具体項目 → 条件付き追加 → 最後に「特に避けたい話題はない」 */
export function avoidTopicChipsOrdered(ctx: {
  occupationRole?: string;
  aiHousehold?: string;
}): { value: string; label: string }[] {
  const extra = AI_AVOID_TOPIC_EXTRA.filter((o) => o.when(ctx));
  const base = AI_AVOID_TOPIC_OPTIONS.filter((o) => o.value !== "none");
  const none = AI_AVOID_TOPIC_OPTIONS.find((o) => o.value === "none");
  return [...base, ...extra, ...(none ? [none] : [])];
}

export const AI_CURRENT_FOCUS_OPTIONS: {
  value: string;
  label: string;
  when?: (ctx: { occupationRole?: string }) => boolean;
}[] = [
  { value: "work_career", label: "仕事・キャリア" },
  { value: "study_exam", label: "学業・試験・資格" },
  { value: "relationships", label: "対人・人間関係" },
  { value: "health_habit", label: "健康・運動・睡眠" },
  { value: "creative", label: "創作・趣味の深掘り" },
  { value: "rest_recovery", label: "休息・メンタルケア" },
  { value: "goals_habits", label: "目標・習慣づくり" },
  { value: "family_home", label: "家庭・暮らし" },
  {
    value: "exam_path",
    label: "受験・進路（学生向け）",
    when: ({ occupationRole }) => occupationRole === "student",
  },
  {
    value: "side_project",
    label: "副業・個人プロジェクト",
    when: ({ occupationRole }) =>
      occupationRole != null && occupationRole !== "" && occupationRole !== "student",
  },
];

export const AI_HEALTH_COMFORT_OPTIONS = [
  { value: "", label: "選ばない" },
  { value: "none", label: "健康の話題は扱わない" },
  { value: "lifestyle", label: "生活習慣レベルまでOK" },
  {
    value: "mood_ok",
    label: "気分・体調の感覚はOK（医療判断はしない前提）",
  },
] as const;

export const AI_HOUSEHOLD_OPTIONS = [
  { value: "", label: "答えたくない" },
  { value: "alone", label: "ひとり暮らし" },
  { value: "partner", label: "パートナーと同居" },
  { value: "kids", label: "子どもがいる" },
  { value: "parents", label: "親と同居" },
  { value: "pets", label: "ペット中心の暮らし" },
  { value: "mixed", label: "複合（複数当てはまる）" },
] as const;

/** MAS memory extraction: how aggressively to store and reuse memories. */
export const AI_MEMORY_RECALL_STYLE_OPTIONS = [
  { value: "", label: "\u9078\u3070\u306a\u3044" },
  { value: "minimal", label: "\u8a18\u61b6\u306e\u4fdd\u5b58\u30fb\u53c2\u7167\u306f\u63a7\u3048\u3081" },
  { value: "normal", label: "\u3075\u3064\u3046\uff08\u4f1a\u8a71\u306b\u6cbf\u3063\u3066\u4f7f\u3046\uff09" },
  { value: "rich", label: "\u95a2\u9023\u3059\u308b\u8a18\u61b6\u3092\u7a4d\u6975\u7684\u306b\u6d3b\u304b\u3059" },
] as const;

export const AI_MEMORY_NAME_POLICY_OPTIONS = [
  { value: "", label: "\u9078\u3070\u306a\u3044" },
  { value: "avoid_names", label: "\u56fa\u6709\u540d\u8a5e\u306f\u907f\u3051\u3001\u4e00\u822c\u5316\u3059\u308b" },
  { value: "neutral", label: "\u30e6\u30fc\u30b6\u30fc\u304c\u540d\u6307\u3057\u3057\u305f\u5834\u5408\u306e\u307f\u8a18\u61b6\u3057\u3066\u3088\u3044" },
  { value: "ok_names", label: "\u56fa\u6709\u540d\u8a5e\u3082\u4e8b\u5b9f\u3068\u3057\u3066\u8a18\u61b6\u3057\u3066\u3088\u3044" },
] as const;

export const AI_MEMORY_FORGET_BIAS_OPTIONS = [
  { value: "", label: "\u9078\u3070\u306a\u3044" },
  { value: "gentle", label: "\u3084\u3055\u3057\u3081\uff08\u524a\u9664\u306f\u6700\u7d42\u624b\u6bb5\uff09" },
  { value: "normal", label: "\u3075\u3064\u3046\uff08\u77db\u76fe\u306f\u66f4\u65b0\u30fb\u524a\u9664\uff09" },
  { value: "strong", label: "\u306f\u3063\u304d\u308a\u3081\uff08\u53e4\u3044\u63a8\u6e2c\u306f\u65e9\u3081\u306b\u524a\u9664\uff09" },
] as const;

function labelMap<T extends readonly { value: string; label: string }[]>(opts: T, v: string): string | undefined {
  return opts.find((o) => o.value === v)?.label;
}

export function formatAgentPersonaForPrompt(profile: {
  /** `aiAddressStyle === "nickname"` のときの表示名（未設定時は「ニックネーム」を名前置きにしないよう指示を出す） */
  nickname?: string;
  aiAddressStyle?: string;
  aiChatTone?: string;
  aiDepthLevel?: string;
  aiEnergyPeak?: string;
  aiBusyWindows?: string[];
  aiAvoidTopics?: string[];
  aiCurrentFocus?: string[];
  aiHealthComfort?: string;
  aiHousehold?: string;
  aiMemoryRecallStyle?: string;
  aiMemoryNamePolicy?: string;
  aiMemoryForgetBias?: string;
}): string[] {
  const lines: string[] = [];
  const addr = profile.aiAddressStyle;
  if (addr) {
    if (addr === "nickname") {
      const nick = profile.nickname?.trim();
      if (nick) {
        lines.push(
          `- 呼び方・距離感: ニックネーム「${nick}」で呼ぶ（例:「${nick}、」で文頭）。語「ニックネーム」を相手の名前として使わない`,
        );
      } else {
        lines.push(
          `- 呼び方・距離感: ニックネームで呼びたいが未登録。相手を「ニックネーム」とは呼ばない。「あなた」や無呼びかけで自然に`,
        );
      }
    } else {
      const lb = labelMap(AI_ADDRESS_STYLE_OPTIONS as unknown as { value: string; label: string }[], addr);
      if (lb) lines.push(`- 呼び方・距離感: ${lb}`);
    }
  }
  const tone = profile.aiChatTone;
  if (tone) {
    const lb = labelMap(AI_CHAT_TONE_OPTIONS as unknown as { value: string; label: string }[], tone);
    if (lb) lines.push(`- AIの話し方（希望）: ${lb}`);
  }
  const depth = profile.aiDepthLevel;
  if (depth) {
    const lb = labelMap(AI_DEPTH_LEVEL_OPTIONS as unknown as { value: string; label: string }[], depth);
    if (lb) lines.push(`- 掘り下げの深さ: ${lb}`);
  }
  const peak = profile.aiEnergyPeak;
  if (peak) {
    const lb = labelMap(AI_ENERGY_PEAK_OPTIONS as unknown as { value: string; label: string }[], peak);
    if (lb) lines.push(`- いちばん元気な時間帯: ${lb}`);
  }
  const busy = profile.aiBusyWindows;
  if (busy && busy.length > 0) {
    const labels = busy
      .map((k) => labelMap(AI_BUSY_WINDOW_OPTIONS as unknown as { value: string; label: string }[], k))
      .filter(Boolean);
    if (labels.length > 0) lines.push(`- 忙しめの時間帯: ${labels.join("、")}`);
  }
  const avoid = profile.aiAvoidTopics;
  if (avoid && avoid.length > 0) {
    if (avoid.includes("none")) {
      lines.push(`- 避けたい話題: 特に指定なし`);
    } else {
      const base = AI_AVOID_TOPIC_OPTIONS.filter((o) => avoid.includes(o.value)).map((o) => o.label);
      const extra = AI_AVOID_TOPIC_EXTRA.filter((o) => avoid.includes(o.value)).map((o) => o.label);
      const all = [...base, ...extra];
      if (all.length > 0) lines.push(`- 避けたい話題: ${all.join("、")}`);
    }
  }
  const focus = profile.aiCurrentFocus;
  if (focus && focus.length > 0) {
    const labels = focus
      .map((k) => AI_CURRENT_FOCUS_OPTIONS.find((o) => o.value === k)?.label)
      .filter(Boolean);
    if (labels.length > 0) lines.push(`- いま関心が高いもの（複数可）: ${labels.join("、")}`);
  }
  const hc = profile.aiHealthComfort;
  if (hc) {
    const lb = labelMap(AI_HEALTH_COMFORT_OPTIONS as unknown as { value: string; label: string }[], hc);
    if (lb) lines.push(`- 健康の話題の扱い: ${lb}`);
  }
  const hh = profile.aiHousehold;
  if (hh) {
    const lb = labelMap(AI_HOUSEHOLD_OPTIONS as unknown as { value: string; label: string }[], hh);
    if (lb) lines.push(`- 暮らしのざっくり（任意）: ${lb}`);
  }
  const mRecall = profile.aiMemoryRecallStyle;
  if (mRecall) {
    const lb = labelMap(AI_MEMORY_RECALL_STYLE_OPTIONS as unknown as { value: string; label: string }[], mRecall);
    if (lb) lines.push(`- 記憶の活かし方: ${lb}`);
  }
  const mName = profile.aiMemoryNamePolicy;
  if (mName) {
    const lb = labelMap(AI_MEMORY_NAME_POLICY_OPTIONS as unknown as { value: string; label: string }[], mName);
    if (lb) lines.push(`- 記憶での固有名詞: ${lb}`);
  }
  const mForget = profile.aiMemoryForgetBias;
  if (mForget) {
    const lb = labelMap(AI_MEMORY_FORGET_BIAS_OPTIONS as unknown as { value: string; label: string }[], mForget);
    if (lb) lines.push(`- 記憶の更新・削除の強さ: ${lb}`);
  }
  return lines;
}

/** Lines for MAS memory extraction prompt (Japanese). */
export function formatMemoryHandlingForMasPrompt(profile: {
  aiMemoryRecallStyle?: string;
  aiMemoryNamePolicy?: string;
  aiMemoryForgetBias?: string;
}): string {
  const parts: string[] = [];
  const rs = profile.aiMemoryRecallStyle;
  if (rs) {
    const lb = labelMap(AI_MEMORY_RECALL_STYLE_OPTIONS as unknown as { value: string; label: string }[], rs);
    if (lb) parts.push(`記憶の活かし方: ${lb}`);
  }
  const np = profile.aiMemoryNamePolicy;
  if (np) {
    const lb = labelMap(AI_MEMORY_NAME_POLICY_OPTIONS as unknown as { value: string; label: string }[], np);
    if (lb) parts.push(`固有名詞の扱い: ${lb}`);
  }
  const fb = profile.aiMemoryForgetBias;
  if (fb) {
    const lb = labelMap(AI_MEMORY_FORGET_BIAS_OPTIONS as unknown as { value: string; label: string }[], fb);
    if (lb) parts.push(`矛盾時の更新・削除: ${lb}`);
  }
  return parts.length > 0
    ? parts.join("\n")
    : "（ユーザーは記憶の扱いを未指定）";
}


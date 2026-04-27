/**
 * MAS（Multi-Agent System）共通型定義
 * オーケストレーターとサブエージェント間の通信インターフェース
 */

// ─── ペルソナ・コンテキスト ────────────────────────────────────────────────

export type PersonaContext = {
  /** formatAgentPersonaForPrompt の出力（呼び方・トーン・掘り下げ・避けたい話題等） */
  instructions: string;
  /** aiAvoidTopics の生の配列（ガード判定に使う） */
  avoidTopics: string[];
  /** MBTI コード（例: "INFP"） */
  mbti?: string;
  /** Love MBTI コード（例: "LCRO"） */
  loveMbti?: string;
  /** MBTI に基づくルーティングヒント（オーケストレーターが生成） */
  mbtiHint?: string;
  /** aiCorrections: ユーザーの訂正メモ */
  corrections?: string[];
};

// ─── 天気コンテキスト ─────────────────────────────────────────────────────

export type WeatherContext = {
  dateYmd: string;
  /** 午前の天気ラベル（例: "晴れ"） */
  amLabel: string;
  /** 午前の気温 */
  amTempC: number | null;
  /** 午後の天気ラベル */
  pmLabel: string;
  /** 午後の気温 */
  pmTempC: number | null;
  /** データソース */
  source: "db_cached" | "open_meteo" | "none";
  /** 会話での活用ヒント（オーケストレーターが生成） */
  narrativeHint?: string;
  /** オーケストレーター system 用（英語）：東京の壁時計・同一日なら太陽位相 */
  wallClockDaylightBlockEn?: string;
};

// ─── エージェント共通リクエスト ──────────────────────────────────────────

export type AgentRequest = {
  userId: string;
  entryId: string;
  entryDateYmd: string;
  /** ユーザーの発言（開口時は空文字） */
  userMessage: string;
  persona: PersonaContext;
  /** 長期記憶（MemoryLongTerm テーブルから抽出した箇条書き） */
  longTermContext?: string;
  /** このエージェントのドメイン別メモリ（AgentMemory テーブルから取得済み） */
  agentMemory: Record<string, string>;
};

// ─── エージェント共通レスポンス ──────────────────────────────────────────

export type AgentResponse = {
  /** エージェントが生成した文脈情報・回答（400字以内を推奨） */
  answer: string;
  /** 更新・追加するメモリエントリ（key → value） */
  updatedMemory?: Record<string, string>;
  /** このエージェントが「今日関連性があるか」の判定 */
  hasRelevantInfo: boolean;
};

// ─── 天気ツール ───────────────────────────────────────────────────────────

export type WeatherToolRequest = {
  userId: string;
  entryId: string;
  entryDateYmd: string;
  /** テスト・決定的な開口用。省略時は `new Date()` */
  now?: Date;
};

// ─── スーパーバイザー ─────────────────────────────────────────────────────

export type SupervisorRequest = {
  userId: string;
  threadId: string;
  agentsUsed: string[];
  /** 会話の最後 N ターン（role + content の配列） */
  recentMessages: { role: string; content: string }[];
  personaInstructions: string;
  /** 実際に使用した mbtiHint */
  mbtiHint?: string;
};

// ─── OpenAI Tool 定義 ─────────────────────────────────────────────────────

export type ToolName =
  | "query_weather"
  | "query_school"
  | "query_calendar_daily"
  | "query_calendar_work"
  | "query_calendar_social"
  | "query_hobby"
  | "query_romance";

export const AGENT_TOOL_NAMES: ToolName[] = [
  "query_weather",
  "query_school",
  "query_calendar_daily",
  "query_calendar_work",
  "query_calendar_social",
  "query_hobby",
  "query_romance",
];

/** OpenAI Chat Completions API の tools パラメータ用定義 */
export const ORCHESTRATOR_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_weather",
      description:
        "対象日のエントリから天気情報（午前・午後の気温・天気）を取得する。DBキャッシュを優先し、未保存時のみOpen-Meteoから取得する。開口のきっかけ作りに使う。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_school",
      description:
        "学生ユーザーの学校に関する情報を取得する。対象日の曜日に対応した時間割列・学習習慣メモリ・学校メモを参照して回答する。職業が student でない場合は呼ばない。",
      parameters: {
        type: "object",
        properties: {
          focus: {
            type: "string",
            description: "ユーザーの発言から抽出した学校関連のキーワード（任意）",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_calendar_daily",
      description:
        "当日〜翌日の Google カレンダー予定（通常の予定・全日イベント）を取得・評価する。時系列（past/ongoing/upcoming/all_day）を判定して返す。",
      parameters: {
        type: "object",
        properties: {
          focus: {
            type: "string",
            description: "取り上げたい予定のキーワード（任意）",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_calendar_work",
      description:
        "バイト・シフト・業務系カレンダーイベントに特化した情報を取得する。『バイト・シフト・出勤・勤務・残業』等のキーワードが含まれるイベントのみ対象。",
      parameters: {
        type: "object",
        properties: {
          focus: { type: "string", description: "関連キーワード（任意）" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_calendar_social",
      description:
        "友人・家族・デート・趣味・記念日など社交・個人系カレンダーイベントに特化した情報を取得する。バイト・学校・就活カテゴリは除く。",
      parameters: {
        type: "object",
        properties: {
          focus: { type: "string", description: "関連キーワード（任意）" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_hobby",
      description:
        "ユーザーの趣味・関心タグ・興味分野をもとに会話の糸口を提案する。MBTI が外向・感情系（E/F）の場合は積極的に呼ぶ。",
      parameters: {
        type: "object",
        properties: {
          focus: {
            type: "string",
            description: "特定の趣味・関心キーワード（任意）",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_romance",
      description:
        "MBTI・Love MBTI の恋愛傾向・相性情報をもとに恋愛系の振り返りや相談の文脈を提供する。aiAvoidTopics に romance が含まれる場合は絶対に呼ばない。",
      parameters: {
        type: "object",
        properties: {
          focus: {
            type: "string",
            description: "恋愛・関係性に関する具体的なキーワード（任意）",
          },
        },
        required: [],
      },
    },
  },
] as const;

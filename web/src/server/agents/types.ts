/**
 * MAS (Multi-Agent System) 共通型定義
 * オーケストレーター ↔ サブエージェント間の通信インターフェース
 */

import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";

/** ユーザーのペルソナ設定（オーケストレーターがサブエージェントへ伝達） */
export type PersonaContext = {
  /** AI の呼び方: nickname / san / tame_light / neutral / "" */
  addressStyle: string;
  /** AI の話し方: empathic / factual / questions / brief / encouraging / "" */
  chatTone: string;
  /** 掘り下げの深さ: light / normal / deep / "" */
  depthLevel: string;
  /** 避けたい話題の値配列（例: ["romance", "health_medical"]） */
  avoidTopics: string[];
  /** 1行テキスト形式（サブエージェントのシステムプロンプト先頭に追記） */
  instructionText: string;
};

/** 天気スナップショット（Weather Tool が返す） */
export type WeatherContext = {
  dateYmd: string;
  am: { temperatureC: number | null; weatherLabel: string; time: string } | null;
  pm: { temperatureC: number | null; weatherLabel: string; time: string } | null;
  locationNote?: string;
  dataSource: "entry_cached" | "live_fetch" | "unavailable";
  /** オーケストレーター向け1行要約 */
  summary: string;
};

/** MBTI ルーティングヒント（オーケストレーターが生成してサブエージェントへ渡す） */
export type MbtiHint = {
  mbti?: string;
  loveMbti?: string;
  /** 人格特性の1行テキスト（サブエージェントが会話スタイルに使う） */
  styleHint: string;
  /** オーケストレーターが優先するエージェントドメイン（判断根拠） */
  preferredDomains: string[];
};

/** ドメイン別エージェントメモリのエントリ */
export type AgentMemoryEntry = {
  key: string;
  value: string;
  confidence: number;
};

/** サブエージェントへのリクエスト共通型 */
export type AgentRequest = {
  userId: string;
  entryId: string;
  entryDateYmd: string;
  /** ユーザーの発言（会話の最新メッセージ） */
  userMessage: string;
  /** このエージェントドメインの既存メモリ */
  agentMemory: AgentMemoryEntry[];
  /** オーケストレーターから伝達されるペルソナ指示 */
  persona: PersonaContext;
  /** MBTI / Love MBTI ルーティングヒント */
  mbtiHint: MbtiHint;
  /** 長期記憶（MemoryLongTerm）から取得した箇条書き要約 */
  longTermContext?: string;
  /** 追加コンテキスト（エージェント固有） */
  extraContext?: Record<string, unknown>;
};

/** サブエージェントからのレスポンス共通型 */
export type AgentResponse = {
  /** エージェント名（トレース用） */
  agentName: string;
  /** 振り返りチャット用の回答テキスト（400字以内推奨） */
  answer: string;
  /** 更新すべきメモリエントリ（なければ空配列） */
  updatedMemory: AgentMemoryEntry[];
  /** このエージェントが使用したモデル */
  model?: string;
  /** 処理時間 ms */
  latencyMs?: number;
  /** エラーが発生した場合（グレースフルデグレード用） */
  error?: string;
};

/** Supervisor エージェントへのリクエスト */
export type SupervisorRequest = {
  userId: string;
  threadId: string;
  agentsUsed: string[];
  conversation: Array<{ role: string; content: string }>;
  personaUsed: PersonaContext;
  weatherUsed?: WeatherContext;
};

/** Tool Calling 用ツール名の定数 */
export const AGENT_TOOL_NAMES = {
  QUERY_WEATHER: "query_weather",
  QUERY_SCHOOL: "query_school",
  QUERY_CALENDAR_DAILY: "query_calendar_daily",
  QUERY_CALENDAR_WORK: "query_calendar_work",
  QUERY_CALENDAR_SOCIAL: "query_calendar_social",
  QUERY_HOBBY: "query_hobby",
  QUERY_ROMANCE: "query_romance",
} as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[keyof typeof AGENT_TOOL_NAMES];

/** OpenAI Tool Calling 用のツール定義 7 本 */
export const AGENT_TOOLS: ChatCompletionFunctionTool[] = [
  {
    type: "function",
    function: {
      name: AGENT_TOOL_NAMES.QUERY_WEATHER,
      description:
        "対象日の天気スナップショット（気温・天気ラベル・午前午後）を取得する。開口メッセージの話題選定に使う。必ず最初に呼び出すこと。",
      parameters: {
        type: "object",
        properties: {
          entryId: { type: "string", description: "日記エントリ ID" },
        },
        required: ["entryId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: AGENT_TOOL_NAMES.QUERY_SCHOOL,
      description:
        "学校関連の情報（その日の時間割・授業・試験・課題・学習習慣）を専任エージェントに問い合わせる。ユーザーが学生の場合に使用。",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "学校・学習に関してユーザーに聞きたいこと・深掘りしたいポイント",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: AGENT_TOOL_NAMES.QUERY_CALENDAR_DAILY,
      description:
        "当日〜翌日の一般的なカレンダー予定（外出・行事・授業以外のイベント）を専任エージェントに問い合わせる。",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "今日の予定について聞きたいこと",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: AGENT_TOOL_NAMES.QUERY_CALENDAR_WORK,
      description:
        "バイト・シフト・業務系のカレンダー予定を専任エージェントに問い合わせる。勤務メモリも保持する。",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "バイト・仕事について聞きたいこと",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: AGENT_TOOL_NAMES.QUERY_CALENDAR_SOCIAL,
      description:
        "友人・家族・デート・趣味イベント・記念日などのソーシャルなカレンダー予定を専任エージェントに問い合わせる。",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "友人・家族・社交系の予定について聞きたいこと",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: AGENT_TOOL_NAMES.QUERY_HOBBY,
      description:
        "ユーザーの趣味・関心・インタレストピックスに関する話題を専任エージェントに問い合わせる。MBTI が E/F/P 系の場合に優先して使用。",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "趣味・関心について聞きたいこと・話したいこと",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: AGENT_TOOL_NAMES.QUERY_ROMANCE,
      description:
        "恋愛・パートナー・MBTI恋愛傾向に関する話題を専任エージェントに問い合わせる。ユーザーの aiAvoidTopics に romance が含まれる場合は絶対に呼び出さないこと。Love MBTI が設定されている場合に有効。",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "恋愛・パートナー関係について聞きたいこと",
          },
        },
        required: ["question"],
      },
    },
  },
];

/** avoidTopics チェック付きで有効なツール一覧を返す */
export function getAvailableTools(avoidTopics: string[]): ChatCompletionFunctionTool[] {
  if (avoidTopics.includes("romance")) {
    return AGENT_TOOLS.filter((t) => t.function.name !== AGENT_TOOL_NAMES.QUERY_ROMANCE);
  }
  return AGENT_TOOLS;
}

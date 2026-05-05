import { describe, expect, it, vi } from "vitest";
import { runCalendarWorkAgent } from "./calendar-work-agent";
import { runCalendarSocialAgent } from "./calendar-social-agent";
import { runCalendarDailyAgent } from "./calendar-daily-agent";

let lastOpenAiCreateArgs: any = null;

vi.mock("@/lib/ai/openai", () => {
  return {
    getOpenAI: () => ({
      chat: {
        completions: {
          create: vi.fn(async (args: any) => {
            lastOpenAiCreateArgs = args;
            return { choices: [{ message: { content: "stub" } }] };
          }),
        },
      },
    }),
  };
});

vi.mock("@/server/calendar", () => {
  return {
    fetchCalendarEventsStartingOnDay: vi.fn(async () => ({
      ok: true,
      events: [
        {
          eventId: "e1",
          calendarId: "c1",
          calendarName: "Main",
          colorId: "",
          title: "Reservation at BARBARA",
          start: "2026-05-03T18:00:00+09:00",
          end: "2026-05-03T19:00:00+09:00",
          location: "BARBARA",
          description: "Dinner at restaurant レストラン",
        },
        {
          eventId: "e2",
          calendarId: "c1",
          calendarName: "Main",
          colorId: "",
          title: "面接",
          start: "2026-05-03T10:00:00+09:00",
          end: "2026-05-03T11:00:00+09:00",
          location: "",
          description: "Interview",
        },
      ],
    })),
  };
});

describe("calendar agents intent integration", () => {
  const baseReq = {
    userId: "u1",
    entryId: "d1",
    entryDateYmd: "2026-05-03",
    userMessage: "",
    persona: { instructions: "", avoidTopics: [] as string[] },
    longTermContext: undefined,
    agentMemory: {},
    calendarOpening: null,
  };

  it("work agent includes interview but not dining reservation", async () => {
    lastOpenAiCreateArgs = null;
    await runCalendarWorkAgent(baseReq as any);
    const userBlock = lastOpenAiCreateArgs?.messages?.[1]?.content ?? "";
    expect(userBlock).toContain("面接");
    expect(userBlock).not.toContain("BARBARA");
  });

  it("social agent includes dining reservation but not interview", async () => {
    lastOpenAiCreateArgs = null;
    await runCalendarSocialAgent(baseReq as any);
    const userBlock = lastOpenAiCreateArgs?.messages?.[1]?.content ?? "";
    expect(userBlock).toContain("BARBARA");
    expect(userBlock).not.toContain("面接");
  });

  it("daily agent excludes work/school buckets by intent", async () => {
    lastOpenAiCreateArgs = null;
    await runCalendarDailyAgent(baseReq as any);
    const userBlock = lastOpenAiCreateArgs?.messages?.[1]?.content ?? "";
    expect(userBlock).toContain("BARBARA");
    expect(userBlock).not.toContain("面接");
  });
});


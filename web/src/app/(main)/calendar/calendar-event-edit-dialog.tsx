"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { FancySelect } from "@/components/fancy-select";
import { isAppLocalCalendarId } from "@/lib/app-local-calendar-id";

export type CalendarEventEditSource = {
  eventId: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  location: string;
  description?: string;
};

export type CalendarPickerItem = { calendarId: string; calendarName: string };

export type CalendarEventCreateContext = {
  dateYmd: string;
  calendars: CalendarPickerItem[];
  suggestedCalendarId?: string;
};

function isAllDayYmd(isoLike: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test((isoLike ?? "").trim());
}

function addDaysYmdTokyo(ymd: string, delta: number): string {
  const ms = Date.parse(`${ymd}T12:00:00+09:00`) + delta * 86400000;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(ms))
    .replaceAll("/", "-");
}

function formatYmdTokyo(isoLike: string): string {
  const raw = (isoLike ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatHmTokyo(isoLike: string): string {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return "00:00";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hh = (parts.find((x) => x.type === "hour")?.value ?? "0").padStart(2, "0");
  const mm = (parts.find((x) => x.type === "minute")?.value ?? "0").padStart(2, "0");
  return `${hh}:${mm}`;
}

function pickInitialCalendarId(ctx: CalendarEventCreateContext): string {
  const sug = (ctx.suggestedCalendarId ?? "").trim();
  if (sug && ctx.calendars.some((c) => c.calendarId === sug)) return sug;
  return (ctx.calendars[0]?.calendarId ?? "").trim();
}

export function CalendarEventEditDialog(props: {
  mode: "edit" | "create";
  open: boolean;
  /** 編集モード時のみ */
  event: CalendarEventEditSource | null;
  /** 新規モード時 */
  createContext?: CalendarEventCreateContext | null;
  canWriteGoogle: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { mode, open, event, createContext, canWriteGoogle, onClose, onSaved } = props;

  const [calendarId, setCalendarId] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [allDayStart, setAllDayStart] = useState("");
  const [allDayEndInc, setAllDayEndInc] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (mode === "edit" && event) {
      setCalendarId(event.calendarId);
      setSummary(event.title ?? "");
      setDescription(event.description ?? "");
      setLocation(event.location ?? "");
      const ad = isAllDayYmd(event.start);
      setAllDay(ad);
      if (ad) {
        const s = event.start.trim();
        const eRaw = (event.end ?? "").trim();
        setAllDayStart(s);
        setAllDayEndInc(eRaw && /^\d{4}-\d{2}-\d{2}$/.test(eRaw) ? addDaysYmdTokyo(eRaw, -1) : s);
      } else {
        setStartDate(formatYmdTokyo(event.start));
        setStartTime(formatHmTokyo(event.start));
        setEndDate(formatYmdTokyo(event.end || event.start));
        setEndTime(formatHmTokyo(event.end || event.start));
      }
    } else if (mode === "create" && createContext) {
      const d = createContext.dateYmd;
      setCalendarId(pickInitialCalendarId(createContext));
      setSummary("");
      setDescription("");
      setLocation("");
      setAllDay(false);
      setStartDate(d);
      setStartTime("10:00");
      setEndDate(d);
      setEndTime("11:00");
      setAllDayStart(d);
      setAllDayEndInc(d);
    }
  }, [open, mode, event, createContext]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const fields = {
        summary,
        description,
        location,
        allDay,
        allDayStartYmd: allDay ? allDayStart : "",
        allDayEndInclusiveYmd: allDay ? allDayEndInc : "",
        startLocal: !allDay ? `${startDate}T${startTime.length === 5 ? `${startTime}:00` : startTime}` : "",
        endLocal: !allDay ? `${endDate}T${endTime.length === 5 ? `${endTime}:00` : endTime}` : "",
      };

      if (mode === "edit") {
        if (!event?.calendarId || !event.eventId) return;
        const res = await fetch("/api/calendar/event", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            calendarId: event.calendarId,
            eventId: event.eventId,
            ...fields,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(typeof j.error === "string" ? j.error : "更新に失敗しました");
          return;
        }
      } else {
        const cid = calendarId.trim();
        if (!cid) {
          setErr("保存先のカレンダーを選んでください");
          return;
        }
        const res = await fetch("/api/calendar/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ calendarId: cid, ...fields }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(typeof j.error === "string" ? j.error : "作成に失敗しました");
          return;
        }
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const titleLabel = mode === "create" ? "予定を追加" : "予定を編集";
  const noCalendars = mode === "create" && (!createContext?.calendars?.length || createContext.calendars.length === 0);

  const cidForPermission = mode === "create" ? calendarId : (event?.calendarId ?? "");
  const needsGoogleWrite = cidForPermission.length > 0 && !isAppLocalCalendarId(cidForPermission);

  if (!open) return null;
  if (mode === "edit" && !event) return null;

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      labelledBy="calendar-event-edit-title"
      dialogId="calendar-event-edit-dialog"
      zClass="z-[60]"
      panelClassName="max-h-[90vh] w-full max-w-lg overflow-hidden"
    >
      <form className="flex max-h-[inherit] flex-col" onSubmit={onSubmit}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 id="calendar-event-edit-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {titleLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            閉じる
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {needsGoogleWrite && !canWriteGoogle ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100">
              <p>
                Google のカレンダーを更新するには「予定の編集」権限（calendar.events）が必要です。設定から Google
                を再連携してください。保存先が「名前(アプリ)」のアプリ内カレンダーだけなら再連携なしで追加できます。
              </p>
              <Link
                href="/settings"
                className="mt-2 inline-block text-sm font-medium text-amber-900 underline dark:text-amber-200"
              >
                設定を開く
              </Link>
            </div>
          ) : null}

          {noCalendars ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              カレンダー一覧がまだありません。しばらく待ってからページを更新するか、設定で Google を再連携してください。
            </p>
          ) : null}

          {err ? <p className="mb-2 text-sm text-red-600 dark:text-red-400">{err}</p> : null}

          {mode === "create" && createContext && !noCalendars ? (
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
              保存先カレンダー
              <FancySelect
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                required
                disabled={(needsGoogleWrite && !canWriteGoogle) || busy}
                className="mt-1 w-full px-2 py-1.5 text-sm text-zinc-900 dark:text-zinc-100"
              >
                {createContext.calendars.map((c) => (
                  <option key={c.calendarId} value={c.calendarId}>
                    {c.calendarName}
                  </option>
                ))}
              </FancySelect>
            </label>
          ) : null}

          <label
            className={["block text-xs font-medium text-zinc-600 dark:text-zinc-300", mode === "create" ? "mt-3" : ""].join(
              " ",
            )}
          >
            タイトル
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              maxLength={4000}
              disabled={(needsGoogleWrite && !canWriteGoogle) || busy || noCalendars}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none ring-zinc-400 focus-visible:ring-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus-visible:ring-zinc-500"
            />
          </label>

          <label className="mt-3 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
            場所（任意）
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={2000}
              disabled={(needsGoogleWrite && !canWriteGoogle) || busy || noCalendars}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none ring-zinc-400 focus-visible:ring-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus-visible:ring-zinc-500"
            />
          </label>

          <label className="mt-3 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
            説明（任意）
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              disabled={(needsGoogleWrite && !canWriteGoogle) || busy || noCalendars}
              className="mt-1 w-full resize-y rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none ring-zinc-400 focus-visible:ring-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus-visible:ring-zinc-500"
            />
          </label>

          <div className="mt-3 flex items-center gap-2">
            <input
              id="cal-edit-allday"
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              disabled={(needsGoogleWrite && !canWriteGoogle) || busy || noCalendars}
              className="h-4 w-4 rounded border-zinc-300 disabled:opacity-50 dark:border-zinc-600"
            />
            <label htmlFor="cal-edit-allday" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              終日
            </label>
          </div>

          {allDay ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                開始日（日本時間の暦日）
                <input
                  type="date"
                  value={allDayStart}
                  onChange={(e) => setAllDayStart(e.target.value)}
                  required
                  disabled={(needsGoogleWrite && !canWriteGoogle) || busy || noCalendars}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                終了日（含む最終日）
                <input
                  type="date"
                  value={allDayEndInc}
                  onChange={(e) => setAllDayEndInc(e.target.value)}
                  required
                  disabled={(needsGoogleWrite && !canWriteGoogle) || busy || noCalendars}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">開始・終了は日本時間（Asia/Tokyo）で入力します。</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">開始</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      disabled={(needsGoogleWrite && !canWriteGoogle) || busy || noCalendars}
                      className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                      disabled={(needsGoogleWrite && !canWriteGoogle) || busy || noCalendars}
                      className="w-[6.5rem] shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">終了</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                      disabled={(needsGoogleWrite && !canWriteGoogle) || busy || noCalendars}
                      className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                      disabled={(needsGoogleWrite && !canWriteGoogle) || busy || noCalendars}
                      className="w-[6.5rem] shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="mt-3 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            {mode === "create"
              ? "Google カレンダーに予定が作成されます。"
              : "変更は Google カレンダーにも反映されます。繰り返し予定を編集すると、シリーズ全体が変わることがあります。"}
          </p>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={(needsGoogleWrite && !canWriteGoogle) || busy || noCalendars}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy ? "保存中…" : mode === "create" ? "追加" : "保存"}
          </button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

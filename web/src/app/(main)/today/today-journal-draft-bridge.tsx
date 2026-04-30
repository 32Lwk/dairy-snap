"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { APP_HEADER_TOOLBAR_BUTTON } from "@/lib/app-header-toolbar";

type TodayJournalDraftContextValue = {
  autoGenerateKey: number;
  bumpAutoGenerate: () => void;
  /** ヘッダー「草案を作成」など UI からの明示操作（弱材料でも確認ダイアログへ） */
  userUiGenerateKey: number;
  bumpUserUiJournalDraft: () => void;
  journalDraftPanelRefreshKey: number;
  bumpJournalDraftPanelRefresh: () => void;
};

const TodayJournalDraftContext = createContext<TodayJournalDraftContextValue | null>(null);

export function useTodayJournalDraftControls(): TodayJournalDraftContextValue {
  const v = useContext(TodayJournalDraftContext);
  if (!v) {
    throw new Error("useTodayJournalDraftControls must be used within TodayJournalDraftProvider");
  }
  return v;
}

export function TodayJournalDraftProvider({ children }: { children: ReactNode }) {
  const [autoGenerateKey, setAutoGenerateKey] = useState(0);
  const [userUiGenerateKey, setUserUiGenerateKey] = useState(0);
  const [journalDraftPanelRefreshKey, setJournalDraftPanelRefreshKey] = useState(0);
  const bumpAutoGenerate = useCallback(() => setAutoGenerateKey((k) => k + 1), []);
  const bumpUserUiJournalDraft = useCallback(() => setUserUiGenerateKey((k) => k + 1), []);
  const bumpJournalDraftPanelRefresh = useCallback(
    () => setJournalDraftPanelRefreshKey((k) => k + 1),
    [],
  );
  const value = useMemo(
    () => ({
      autoGenerateKey,
      bumpAutoGenerate,
      userUiGenerateKey,
      bumpUserUiJournalDraft,
      journalDraftPanelRefreshKey,
      bumpJournalDraftPanelRefresh,
    }),
    [
      autoGenerateKey,
      userUiGenerateKey,
      journalDraftPanelRefreshKey,
      bumpAutoGenerate,
      bumpUserUiJournalDraft,
      bumpJournalDraftPanelRefresh,
    ],
  );
  return (
    <TodayJournalDraftContext.Provider value={value}>{children}</TodayJournalDraftContext.Provider>
  );
}

/** 今日ページ：スマホ（md 未満）のみヘッダー右に表示。草案生成キーを進める。 */
export function TodayMobileJournalDraftHeaderButton() {
  const { bumpUserUiJournalDraft } = useTodayJournalDraftControls();
  return (
    <button
      type="button"
      className={`${APP_HEADER_TOOLBAR_BUTTON} md:hidden`}
      onClick={() => bumpUserUiJournalDraft()}
    >
      草案を作成
    </button>
  );
}

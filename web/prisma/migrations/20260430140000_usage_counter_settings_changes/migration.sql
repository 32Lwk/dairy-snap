-- Chat経由の設定自動適用カウント（日次）
ALTER TABLE "usage_counters" ADD COLUMN "settingsChanges" INTEGER NOT NULL DEFAULT 0;

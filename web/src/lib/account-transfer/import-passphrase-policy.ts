/** インポート時パスフレーズの連続誤り上限（この回数に達するとクールダウン） */
export const IMPORT_PASSPHRASE_ATTEMPT_LIMIT = 10;

/** 試行上限到達後、再試行できない時間（分） */
export const IMPORT_PASSPHRASE_COOLDOWN_MINUTES = 30;

/**
 * 失敗回数がカウントされる時間窓（分）。
 * server `job-store` の PASSPHRASE_WINDOW と一致させること。
 */
export const IMPORT_PASSPHRASE_COUNTING_WINDOW_MINUTES = 30;

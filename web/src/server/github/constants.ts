export const GITHUB_OAUTH_PROVIDER = "github" as const;

export const GITHUB_API_BASE = "https://api.github.com";

export const GITHUB_OAUTH_AUTHORIZE = "https://github.com/login/oauth/authorize";

export const GITHUB_OAUTH_ACCESS_TOKEN = "https://github.com/login/oauth/access_token";

export const GITHUB_GRAPHQL = "https://api.github.com/graphql";

/** 公開情報のみ */
export const GITHUB_SCOPE_PUBLIC = "read:user user:email";

/** 非公開リポジトリの活動も含めたい場合（ユーザが選択） */
export const GITHUB_SCOPE_PRIVATE = "read:user user:email repo";

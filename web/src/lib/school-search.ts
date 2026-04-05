import schoolsBundle from "./schools-data.json";

export type SchoolIndexRow = {
  id: string;
  name: string;
  prefecture: string;
  address: string;
  kind: string;
};

export type SchoolSearchHit = {
  id: string;
  name: string;
  prefecture: string;
  city: string;
  /** 一覧用。中学・高校は学校名に種別が含まれるため空にする */
  kind: string;
};

type SchoolsBundle = {
  rows: SchoolIndexRow[];
  byPrefecture: Record<string, number[]>;
  byPrefectureKind?: Record<string, number[]>;
  byKind?: Record<string, number[]>;
};

const { rows: ROWS, byPrefecture: BY_PREF, byPrefectureKind: BY_PREF_KIND, byKind: BY_KIND } =
  schoolsBundle as SchoolsBundle;

const KIND_LABEL: Record<string, string> = {
  C1: "中学",
  D1: "高校",
  F1: "大学",
  F2: "短大",
  G1: "高専",
};

function cityFromAddress(address: string, prefecture: string): string {
  if (!address.startsWith(prefecture)) {
    return address.slice(0, 24);
  }
  const rest = address.slice(prefecture.length);
  const m = rest.match(/^(.{1,20}?[市区町村])/);
  return m ? m[1].trim() : rest.slice(0, 16).trim();
}

function listKindLabel(row: SchoolIndexRow): string {
  if (row.kind === "C1" || row.kind === "D1") {
    return "";
  }
  return KIND_LABEL[row.kind] ?? row.kind;
}

function toHit(row: SchoolIndexRow): SchoolSearchHit {
  return {
    id: row.id,
    name: row.name,
    prefecture: row.prefecture,
    city: cityFromAddress(row.address, row.prefecture),
    kind: listKindLabel(row),
  };
}

/**
 * @param prefecture 都道府県名（例: 愛知県）。空のときは全国。種別1件指定時は q なしでも閲覧用に先頭から返す
 * @param q 学校名に含まれる文字列（先頭一致を優先）。全国かつ種別1件なら1文字から可、それ以外は2文字以上
 */
export function searchSchoolsIndex(options: {
  prefecture?: string;
  q?: string;
  kinds?: string[]; // 例: ["D1"]（高校） / ["F1"]（大学）
  limit?: number;
}): SchoolSearchHit[] {
  const limit = Math.min(Math.max(options.limit ?? 80, 1), 120);
  const pref = options.prefecture?.trim() ?? "";
  const q = options.q?.trim() ?? "";
  const kinds = (options.kinds ?? []).map((s) => s.trim()).filter(Boolean);

  const prefIndices = pref ? (BY_PREF[pref] ?? null) : null;
  const prefKindIndices =
    pref && kinds.length === 1 && BY_PREF_KIND ? (BY_PREF_KIND[`${pref}|${kinds[0]}`] ?? null) : null;

  if (!q) {
    if (pref) {
      const indices = prefKindIndices ?? prefIndices;
      if (!indices) return [];
      const rows: SchoolIndexRow[] = [];
      for (let i = 0; i < indices.length; i++) {
        rows.push(ROWS[indices[i]]);
      }
      rows.sort((a, b) => a.name.localeCompare(b.name, "ja"));
      const n = Math.min(rows.length, limit);
      const out: SchoolSearchHit[] = [];
      for (let i = 0; i < n; i++) {
        out.push(toHit(rows[i]));
      }
      return out;
    }
    // 県未選択・検索語なし: 学校段階で種別が1つに決まっているときだけ全国を閲覧用に返す（学校名順）
    if (kinds.length === 1 && BY_KIND) {
      const indices = BY_KIND[kinds[0]] ?? [];
      const rows: SchoolIndexRow[] = [];
      for (let i = 0; i < indices.length; i++) {
        rows.push(ROWS[indices[i]]);
      }
      rows.sort((a, b) => a.name.localeCompare(b.name, "ja"));
      const n = Math.min(rows.length, limit);
      const out: SchoolSearchHit[] = [];
      for (let i = 0; i < n; i++) {
        out.push(toHit(rows[i]));
      }
      return out;
    }
    return [];
  }

  if (!pref && q.length < 2 && !(q.length === 1 && kinds.length === 1)) {
    return [];
  }

  const prefixRows: SchoolIndexRow[] = [];
  const otherRows: SchoolIndexRow[] = [];

  const kindOk = (row: SchoolIndexRow) => (kinds.length ? kinds.includes(row.kind) : true);

  /** 全国検索で種別1件なら byKind のみ走査（全件より高速） */
  const nationalKindIndices =
    !pref && kinds.length === 1 && BY_KIND ? (BY_KIND[kinds[0]] ?? null) : null;

  if (prefIndices) {
    const indices = prefKindIndices ?? prefIndices;
    for (let i = 0; i < indices.length; i++) {
      const row = ROWS[indices[i]];
      if (!kindOk(row)) continue;
      if (!row.name.includes(q)) continue;
      if (row.name.startsWith(q)) prefixRows.push(row);
      else otherRows.push(row);
    }
  } else if (nationalKindIndices) {
    for (let i = 0; i < nationalKindIndices.length; i++) {
      const row = ROWS[nationalKindIndices[i]];
      if (!row.name.includes(q)) continue;
      if (row.name.startsWith(q)) prefixRows.push(row);
      else otherRows.push(row);
    }
  } else {
    for (let i = 0; i < ROWS.length; i++) {
      const row = ROWS[i];
      if (!kindOk(row)) continue;
      if (!row.name.includes(q)) continue;
      if (row.name.startsWith(q)) prefixRows.push(row);
      else otherRows.push(row);
    }
  }

  prefixRows.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  if (prefixRows.length >= limit) {
    return prefixRows.slice(0, limit).map(toHit);
  }

  otherRows.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const out: SchoolSearchHit[] = [];
  for (let i = 0; i < prefixRows.length; i++) {
    out.push(toHit(prefixRows[i]));
  }
  for (let i = 0; i < otherRows.length && out.length < limit; i++) {
    out.push(toHit(otherRows[i]));
  }
  return out;
}

export function schoolKindLabelJa(kindCode: string): string {
  return KIND_LABEL[kindCode] ?? kindCode;
}

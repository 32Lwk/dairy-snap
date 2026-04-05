/** 詳細タグの子ブロック（interest-taxonomy の InterestFine と構造互換） */
export type NestedFineChunk = {
  micro?: { id: string; label: string }[];
  works?: { id: string; label: string }[];
};

/**
 * 詳細タグ1件に micro（テーマ・見方）と works（作品・選手・タイトル例など）を付与する。
 * 子 ID は `parentId:m_<key>` / `parentId:w_<key>` で一意にする。
 */
export function microWorks(
  parentId: string,
  micro: Record<string, string>,
  works: Record<string, string>,
): NestedFineChunk {
  return {
    micro: Object.entries(micro).map(([k, label]) => ({
      id: `${parentId}:m_${k}`,
      label,
    })),
    works: Object.entries(works).map(([k, label]) => ({
      id: `${parentId}:w_${k}`,
      label,
    })),
  };
}

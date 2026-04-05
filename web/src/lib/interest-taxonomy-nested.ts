/**
 * 詳細タグ（InterestFine）に micro / works を付与するための共通ヘルパー。
 * 子 ID は `${baseId}:m_${key}` / `${baseId}:t_${key}`（key は英数字とアンダースコアのみ）。
 */

export type NestedFineDef = {
  id: string;
  label: string;
  micro?: NestedFineDef[];
  works?: NestedFineDef[];
};

export function withNestedFine(
  id: string,
  label: string,
  micro: Record<string, string>,
  works: Record<string, string>,
): NestedFineDef {
  return {
    id,
    label,
    micro: Object.entries(micro).map(([key, lab]) => ({
      id: `${id}:m_${key}`,
      label: lab,
    })),
    works: Object.entries(works).map(([key, lab]) => ({
      id: `${id}:t_${key}`,
      label: lab,
    })),
  };
}

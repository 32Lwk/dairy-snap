/** プロフィールの職業・立場（settings / オンボーディング共通） */

export const OCCUPATION_ROLE_OPTIONS = [
  { value: "", label: "選ばない" },
  { value: "student", label: "学生" },
  { value: "company", label: "会社員・派遣など" },
  { value: "public_sector", label: "公務員・教員など" },
  { value: "self_employed", label: "自営・フリーランス" },
  { value: "homemaker", label: "専業主婦・主夫など" },
  { value: "job_seeking", label: "求職中・休職中" },
  { value: "other", label: "その他" },
] as const;

export function labelForOccupationRole(value: string): string {
  const row = OCCUPATION_ROLE_OPTIONS.find((o) => o.value === value);
  return row?.label ?? value;
}

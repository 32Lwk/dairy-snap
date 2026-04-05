import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { searchSchoolsIndex } from "@/lib/school-search";

/**
 * 学校検索（学校基本調査データ由来・中学・高校・大学・短大・高専）。
 * - pref: 都道府県名（例: 愛知県）で絞り込み
 * - q: 学校名の一部（先頭一致を優先して並べ替え）
 * pref のみ: その県の学校を先頭から最大 limit 件
 * pref なし・q なし: kind が1種類に限定されているとき全国のその種別を先頭から（閲覧用）
 * q のみ（全国）: 通常は2文字以上。kind が1種類なら1文字から可（走査は種別インデックスのみ）
 */
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const pref = (req.nextUrl.searchParams.get("pref") ?? "").trim();
  const qRaw = req.nextUrl.searchParams.get("q") ?? "";
  const q = qRaw.trim().slice(0, 40);
  const kindRaw = (req.nextUrl.searchParams.get("kind") ?? "").trim();
  const kinds = kindRaw
    ? kindRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 80;

  const kindsLen = kinds?.length ?? 0;
  const allowNationalBrowse = !pref && !q && kindsLen === 1;
  const allowNationalOneChar = !pref && q.length === 1 && kindsLen === 1;
  if (!pref && q.length < 2 && !allowNationalBrowse && !allowNationalOneChar) {
    return NextResponse.json({ schools: [] });
  }

  const schools = searchSchoolsIndex({
    prefecture: pref || undefined,
    q: q || undefined,
    kinds,
    limit: Number.isFinite(limit) ? limit : 80,
  });

  return NextResponse.json(
    { schools },
    {
      headers: {
        // 学校マスタは静的。再検索・戻る操作でキャッシュが効く
        "Cache-Control": "private, max-age=120, stale-while-revalidate=600",
      },
    },
  );
}

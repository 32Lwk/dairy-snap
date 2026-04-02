import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SearchClient } from "./search-client";

export default async function SearchPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-zinc-500">読み込み中…</div>}>
      <SearchClient />
    </Suspense>
  );
}

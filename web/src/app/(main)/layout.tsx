import { AppBottomNav } from "@/components/app-bottom-nav";
import { AuthSessionProvider } from "@/components/auth-session-provider";

export default function MainAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthSessionProvider>
      <div className="flex min-h-full flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <main className="flex-1">{children}</main>
        <AppBottomNav />
      </div>
    </AuthSessionProvider>
  );
}

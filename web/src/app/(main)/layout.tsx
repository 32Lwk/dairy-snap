import { AuthSessionProvider } from "@/components/auth-session-provider";
import { MainLayoutBody } from "@/components/main-layout-body";
import { SettingsSyncProvider } from "@/components/settings-sync-provider";

export default function MainAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthSessionProvider>
      <SettingsSyncProvider>
        <MainLayoutBody>{children}</MainLayoutBody>
      </SettingsSyncProvider>
    </AuthSessionProvider>
  );
}

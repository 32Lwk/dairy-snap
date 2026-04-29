import { AuthSessionProvider } from "@/components/auth-session-provider";
import { MainLayoutBody } from "@/components/main-layout-body";
import { SettingsSyncProvider } from "@/components/settings-sync-provider";
import { TimeZoneBootstrap } from "@/components/time-zone-bootstrap";

export default function MainAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthSessionProvider>
      <SettingsSyncProvider>
        <TimeZoneBootstrap />
        <MainLayoutBody>{children}</MainLayoutBody>
      </SettingsSyncProvider>
    </AuthSessionProvider>
  );
}

import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsAccountsCard } from "@/components/settings/settings-accounts-card";
import { SettingsAppearanceCard } from "@/components/settings/settings-appearance-card";
import { SettingsDangerCard } from "@/components/settings/settings-danger-card";
import { SettingsNotificationsCard } from "@/components/settings/settings-notifications-card";
import { SettingsProfileCard } from "@/components/settings/settings-profile-card";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Settings"
        description="Profile, appearance, notifications, and the accounts powering detection."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingsProfileCard />
        <div className="flex flex-col gap-4">
          <SettingsAppearanceCard />
          <SettingsAccountsCard />
        </div>
        <SettingsNotificationsCard />
        <SettingsDangerCard />
      </div>
    </div>
  );
}

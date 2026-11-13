import type { Metadata } from "next";
import { SettingsHeader } from "@/features/settings/components/settings-header";
import { NewUserForm } from "@/features/users/components/user-forms";

export const metadata: Metadata = { title: "Add a user · HandMadesByUs" };

export default function NewUserPage() {
  return (
    <section className="flex flex-col gap-6">
      <SettingsHeader
        title="Add a user"
        back={{ href: "/settings/users", label: "Users" }}
      />
      <NewUserForm />
    </section>
  );
}

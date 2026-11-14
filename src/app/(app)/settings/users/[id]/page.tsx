import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/page-section";
import { Suspense } from "react";
import {
  ListSkeleton,
  SettingsHeader,
} from "@/features/settings/components/settings-header";
import {
  ChangeOwnPasswordForm,
  RenameUserForm,
  ResetPasswordForm,
  UserStatusButton,
} from "@/features/users/components/user-forms";
import { getUser } from "@/features/users/queries";

export const metadata: Metadata = { title: "User · HandMadesByUs" };

// The id comes from the URL, so it's read inside <Suspense> (see settings/lists/[list]).
export default function UserPage({
  params,
}: PageProps<"/settings/users/[id]">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <User params={params} />
      </Suspense>
    </section>
  );
}

async function User({
  params,
}: Pick<PageProps<"/settings/users/[id]">, "params">) {
  const { id } = await params;
  if (id.length > 64) notFound();
  const user = await getUser(id);
  if (!user) notFound();
  return (
    <>
      <SettingsHeader
        title={user.isYou ? `${user.name} (you)` : user.name}
        description={`@${user.username}${user.active ? "" : " · Deactivated: can't sign in"}`}
        back={{ href: "/settings/users", label: "Users" }}
      />
      <RenameUserForm userId={user.id} name={user.name} />
      {user.isYou ? (
        <PageSection title="Change password">
          <ChangeOwnPasswordForm />
        </PageSection>
      ) : (
        <>
          <PageSection title="Reset password">
            <ResetPasswordForm userId={user.id} />
          </PageSection>
          <PageSection title={user.active ? "Deactivate" : "Reactivate"}>
            <p className="text-muted-foreground">
              {user.active
                ? "Deactivated users are signed out and can't sign in. Their past work keeps their name."
                : "Lets them sign in again with their current password."}
            </p>
            <UserStatusButton
              userId={user.id}
              name={user.name}
              active={user.active}
            />
          </PageSection>
        </>
      )}
    </>
  );
}

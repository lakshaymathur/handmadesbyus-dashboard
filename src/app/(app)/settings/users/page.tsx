import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  ListSkeleton,
  SettingsHeader,
} from "@/features/settings/components/settings-header";
import { getUsers } from "@/features/users/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Users · HandMadesByUs" };

export default function UsersPage() {
  return (
    <section className="flex flex-col gap-6">
      <SettingsHeader
        title="Users"
        description="Everyone who signs in. All users can see and change everything, including finances."
      />
      <Suspense fallback={<ListSkeleton />}>
        <UserList />
      </Suspense>
      <Link
        href="/settings/users/new"
        className={buttonVariants({ className: "h-11" })}
      >
        <Plus aria-hidden />
        Add a user
      </Link>
    </section>
  );
}

async function UserList() {
  const users = await getUsers();
  return (
    <ul className="divide-y rounded-lg border">
      {users.map((user) => (
        <li key={user.id}>
          <Link
            href={`/settings/users/${user.id}`}
            className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  "font-medium break-words",
                  !user.active && "text-muted-foreground line-through",
                )}
              >
                {user.name}
                {user.isYou && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    (you)
                  </span>
                )}
              </span>
              <span className="text-sm text-muted-foreground">
                @{user.username}
                {!user.active && " · Deactivated"}
              </span>
            </span>
            <ChevronRight
              className="size-4 text-muted-foreground"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

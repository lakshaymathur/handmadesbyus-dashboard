"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";
import { isActive, navItems } from "./nav-items";

/** Thumb-reach tab bar on phones. Hidden from md up, where the header shows the links. */
export function BottomNav() {
  // The pathname is request data: reading it inside <Suspense> keeps the page shell
  // prerenderable. The fallback is the same links with no tab highlighted.
  return (
    <Suspense fallback={<BottomNavLinks pathname={null} />}>
      <BottomNavWithPathname />
    </Suspense>
  );
}

function BottomNavWithPathname() {
  return <BottomNavLinks pathname={usePathname()} />;
}

function BottomNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {navItems.map((item) => {
          const { href, label, icon: Icon } = item;
          const active = pathname !== null && isActive(pathname, item);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

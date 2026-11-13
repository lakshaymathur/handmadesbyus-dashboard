"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";
import { isActive, navItems } from "./nav-items";

/** Header links on tablets and desktops (md and up). */
export function TopNav() {
  // The pathname is request data: reading it inside <Suspense> keeps the page shell
  // prerenderable. The fallback is the same links with no tab highlighted.
  return (
    <Suspense fallback={<TopNavLinks pathname={null} />}>
      <TopNavWithPathname />
    </Suspense>
  );
}

function TopNavWithPathname() {
  return <TopNavLinks pathname={usePathname()} />;
}

function TopNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {navItems.map((item) => {
          const { href, label } = item;
          const active = pathname !== null && isActive(pathname, item);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm",
                  active
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

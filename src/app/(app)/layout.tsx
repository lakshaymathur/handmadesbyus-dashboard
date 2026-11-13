import { Suspense } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopNav } from "@/components/layout/top-nav";
import { CurrentUserName } from "@/features/auth/components/current-user-name";

// Signed-in area. This layout only shows who is signed in: it does NOT protect the pages
// below it (Next.js renders them independently). Data is protected by requireUser() in
// queries and authedAction() in server actions; proxy.ts redirects visitors without a
// session cookie.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <span className="font-heading font-semibold">HandMadesByUs</span>
          <TopNav />
          <Suspense fallback={null}>
            <CurrentUserName />
          </Suspense>
        </div>
      </header>
      {/* Bottom padding keeps content clear of the fixed tab bar on phones. */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-24 md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

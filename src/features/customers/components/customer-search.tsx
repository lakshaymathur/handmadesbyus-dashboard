"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

/**
 * The customer search box. It updates `?q=` as you type (after a short pause), so results
 * come from the server and the URL can be shared; Enter works without JavaScript too.
 */
export function CustomerSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initial);
  // The URL's query as last seen, and the last one this box put there. When the URL
  // changes for another reason (the Customers tab, a link), the box follows it; when it
  // catches up with our own typing, the box keeps what's typed since.
  const [seen, setSeen] = useState(initial);
  const [pushed, setPushed] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    if (initial !== pushed) {
      setQuery(initial);
      setPushed(initial);
    }
  }
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function search(value: string) {
    const q = value.trim();
    setPushed(q);
    startTransition(() => {
      router.replace(
        q ? `/customers?q=${encodeURIComponent(q)}` : "/customers",
        {
          scroll: false,
        },
      );
    });
  }

  return (
    <form
      role="search"
      action="/customers"
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        search(query);
      }}
      className="relative"
    >
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        name="q"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          clearTimeout(timer.current);
          const value = e.target.value;
          timer.current = setTimeout(() => search(value), 300);
        }}
        placeholder="Name, mobile, @handle or C-0001"
        aria-label="Search customers"
        aria-busy={pending || undefined}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        maxLength={100}
        className="h-11 pl-9"
      />
    </form>
  );
}

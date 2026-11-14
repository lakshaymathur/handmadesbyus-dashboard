"use client";

import { Search, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  findCustomers,
  getCustomerForPicker,
} from "@/features/customers/actions";
import { CustomerForm } from "@/features/customers/components/customer-form";
import { formatMobile } from "@/features/customers/format";
import type {
  CustomerDetail,
  CustomerSummary,
} from "@/features/customers/queries";

type Props = {
  selected: CustomerDetail | null;
  onSelect: (customer: CustomerDetail | null) => void;
  error?: string;
};

/**
 * Choose the order's customer (§3.2): search by name, mobile, @handle or C-number, or add
 * a new customer without leaving the order. Lives outside the order's <form> (the new
 * customer form is a form of its own).
 */
export function CustomerPicker({ selected, onSelect, error }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSummary[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function search(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    if (value.trim() === "") {
      setResults(null);
      return;
    }
    timer.current = setTimeout(async () => {
      const ask = ++latest.current;
      const result = await findCustomers({ query: value }).catch(() => null);
      if (ask !== latest.current) return; // a newer search is on its way
      setResults(result?.ok ? result.data : []);
    }, 250);
  }

  async function choose(id: string) {
    setProblem(null);
    const result = await getCustomerForPicker({ id }).catch(() => null);
    if (result?.ok) {
      onSelect(result.data);
      setQuery("");
      setResults(null);
    } else {
      setProblem(
        result?.ok === false
          ? result.error
          : "Couldn't load that customer. Try again.",
      );
    }
  }

  if (selected) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium wrap-anywhere">{selected.name}</span>
          <span className="text-sm text-muted-foreground">
            {selected.code} · {formatMobile(selected.mobile)}
            {selected.instagramHandle && ` · @${selected.instagramHandle}`}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0"
          onClick={() => onSelect(null)}
        >
          Change
        </Button>
      </div>
    );
  }

  if (adding) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">New customer</h3>
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            onClick={() => setAdding(false)}
            aria-label="Cancel adding a customer"
          >
            <X aria-hidden />
          </Button>
        </div>
        <CustomerForm
          onCreated={(customer) => {
            setAdding(false);
            onSelect(customer);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Name, mobile, @handle or C-0001"
          aria-label="Find the customer"
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="h-11 pl-9"
        />
      </div>
      {results && (
        <ul
          className="divide-y rounded-lg border"
          aria-label="Matching customers"
        >
          {results.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">
              No customer matches.
            </li>
          ) : (
            results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => choose(c.id)}
                  className="flex min-h-12 w-full flex-col items-start px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="font-medium wrap-anywhere">{c.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {c.code} · {formatMobile(c.mobile)}
                    {c.city && ` · ${c.city}`}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-11 sm:w-fit"
        onClick={() => setAdding(true)}
      >
        <UserPlus aria-hidden />
        New customer
      </Button>
      {(error || problem) && (
        <p className="text-sm text-destructive">{problem ?? error}</p>
      )}
    </div>
  );
}

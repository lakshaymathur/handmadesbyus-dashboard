import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LIST_PAGES } from "@/features/settings/schema";

export const metadata: Metadata = { title: "Settings · HandMadesByUs" };

const sections: { title: string; links: { href: string; label: string }[] }[] =
  [
    {
      title: "Products",
      links: [
        {
          href: "/settings/categories",
          label: "Categories and production stages",
        },
        {
          href: "/settings/customisations",
          label: "Customisation options",
        },
        ...(["types", "colours", "designs"] as const).map((slug) => ({
          href: `/settings/lists/${slug}`,
          label: LIST_PAGES[slug].title,
        })),
      ],
    },
    {
      title: "Shipping",
      links: [
        { href: "/settings/delivery-partners", label: "Delivery partners" },
        {
          href: "/settings/lists/aggregators",
          label: LIST_PAGES.aggregators.title,
        },
      ],
    },
  ];

export default function SettingsPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-heading text-xl font-semibold">Settings</h1>
      {sections.map((section) => (
        <div key={section.title} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {section.title}
          </h2>
          <ul className="divide-y rounded-lg border">
            {section.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex h-12 items-center justify-between px-3 hover:bg-muted"
                >
                  {link.label}
                  <ChevronRight
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

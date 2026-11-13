import {
  ClipboardList,
  Ellipsis,
  House,
  Package,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other sections that light up this tab (e.g. Settings is reached from More). */
  also?: string[];
};

export const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/products", label: "Products", icon: Package },
  { href: "/more", label: "More", icon: Ellipsis, also: ["/settings"] },
];

function matches(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function isActive(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.also ?? [])].some((href) =>
    matches(pathname, href),
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  ArrowLeftRight,
  Plus,
  PieChart,
  MoreHorizontal,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "/dashboard", icon: House },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
  { label: "fab", href: "/transactions/new" },
  { label: "Budgets", href: "/budgets", icon: PieChart },
  { label: "More", href: "/more", icon: MoreHorizontal },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

interface BottomNavProps {
  unreadCount?: number;
}

export function BottomNav({ unreadCount = 0 }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      data-testid="bottom-nav"
      className="flex h-16 items-center justify-around border-t border-hairline bg-surface-raised md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        if (item.label === "fab") {
          return (
            <Link
              key="fab"
              href={item.href}
              aria-label="Add transaction"
              className="flex h-14 w-14 items-center justify-center rounded-lg bg-brand-accent-strong"
            >
              <Plus strokeWidth={2} className="h-6 w-6 text-brand-on-accent" />
            </Link>
          );
        }

        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 ${
              isActive(pathname, item.href)
                ? "text-brand-accent"
                : "text-ink-secondary"
            }`}
          >
            <span className="relative">
              <Icon strokeWidth={1.75} className="h-5 w-5" />
              {item.label === "More" && unreadCount > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-accent text-[10px] font-bold text-white"
                  aria-label={`${unreadCount} unread notifications`}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
            <span className="text-[10px] leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

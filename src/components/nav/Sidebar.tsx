"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  ArrowLeftRight,
  PieChart,
  Target,
  BarChart2,
  CalendarDays,
  FileText,
  Bell,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import { signOut } from "@/features/auth/server/actions";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { label: "Home", href: "/dashboard", icon: House },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
  { label: "Budgets", href: "/budgets", icon: PieChart },
  { label: "Goals", href: "/goals", icon: Target },
  { label: "Analytics", href: "/analytics", icon: BarChart2 },
  { label: "Monthly Summary", href: "/summary", icon: CalendarDays },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Family", href: "/family", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

interface SidebarProps {
  unreadCount?: number;
}

export function Sidebar({ unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      data-testid="sidebar"
      className="hidden h-full w-56 shrink-0 flex-col border-r border-hairline bg-surface-raised md:flex"
    >
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-sm font-semibold text-ink-primary">
          My Budget
        </p>
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`flex min-h-[44px] items-center gap-3 rounded-md px-3 transition-colors ${
                  active
                    ? "bg-surface-inset text-brand-accent"
                    : "text-ink-secondary hover:bg-surface-inset hover:text-ink-primary"
                }`}
              >
                <span className="relative shrink-0">
                  <Icon strokeWidth={1.75} className="h-5 w-5" />
                  {item.label === "Notifications" && unreadCount > 0 && (
                    <span
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-accent text-[10px] font-bold text-white"
                      aria-label={`${unreadCount} unread notifications`}
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex shrink-0 flex-col gap-1 border-t border-hairline px-3 py-3">
        <ThemeToggle />
        <form action={signOut} noValidate>
          <button
            type="submit"
            className="flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 text-sm text-ink-secondary transition-colors hover:bg-surface-inset hover:text-ink-primary"
          >
            <LogOut strokeWidth={1.75} className="h-5 w-5 shrink-0" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

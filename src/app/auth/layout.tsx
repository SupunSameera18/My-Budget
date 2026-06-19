import { ThemeToggle } from "@/components/ThemeToggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-surface-base px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle variant="icon" />
      </div>
      <div className="w-full max-w-sm">
        <p className="mb-8 text-center text-2xl font-bold text-ink-primary">
          My Budget
        </p>
        {children}
      </div>
    </div>
  );
}

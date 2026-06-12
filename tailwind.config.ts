import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
      },
      // Tremor design-system tokens — required for chart axis labels, tooltips, and grid lines
      fontSize: {
        "tremor-label": ["0.75rem", { lineHeight: "1rem" }],
        "tremor-default": ["0.875rem", { lineHeight: "1.25rem" }],
        "tremor-title": ["1.125rem", { lineHeight: "1.75rem" }],
        "tremor-metric": ["1.875rem", { lineHeight: "2.25rem" }],
      },
      colors: {
        tremor: {
          brand: {
            faint: "#eff6ff",
            muted: "#bfdbfe",
            subtle: "#60a5fa",
            DEFAULT: "#3b82f6",
            emphasis: "#1d4ed8",
            inverted: "#ffffff",
          },
          background: {
            muted: "#f9fafb",
            subtle: "#f3f4f6",
            DEFAULT: "#ffffff",
            emphasis: "#374151",
          },
          border: { DEFAULT: "#e5e7eb" },
          ring: { DEFAULT: "#e5e7eb" },
          content: {
            subtle: "#9ca3af",
            DEFAULT: "#6b7280",
            emphasis: "#374151",
            strong: "#111827",
            inverted: "#ffffff",
          },
          card: "#ffffff",
          dropdown: "#ffffff",
        },
        "dark-tremor": {
          brand: {
            faint: "#0B1229",
            muted: "#172554",
            subtle: "#1e40af",
            DEFAULT: "#3b82f6",
            emphasis: "#60a5fa",
            inverted: "#030712",
          },
          background: {
            muted: "#131A2B",
            subtle: "#1f2937",
            DEFAULT: "#111827",
            emphasis: "#d1d5db",
          },
          border: { DEFAULT: "#374151" },
          ring: { DEFAULT: "#1f2937" },
          content: {
            subtle: "#4b5563",
            DEFAULT: "#9ca3af",
            emphasis: "#d1d5db",
            strong: "#f9fafb",
            inverted: "#000000",
          },
          card: "#1f2937",
          dropdown: "#1f2937",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        // DESIGN.md brand tokens
        "brand-accent": "var(--budget-accent)",
        "brand-accent-strong": "var(--budget-accent-strong)",
        "brand-accent-text": "var(--budget-accent-text)",
        "brand-on-accent": "var(--budget-on-accent)",
        "surface-base": "var(--budget-surface-base)",
        "surface-raised": "var(--budget-surface-raised)",
        "surface-inset": "var(--budget-surface-inset)",
        "ink-primary": "var(--budget-ink-primary)",
        "ink-secondary": "var(--budget-ink-secondary)",
        hairline: "var(--budget-hairline)",
        income: {
          DEFAULT: "var(--budget-income)",
          text: "var(--budget-income-text)",
        },
        expense: {
          DEFAULT: "var(--budget-expense)",
          text: "var(--budget-expense-text)",
        },
        saving: {
          DEFAULT: "var(--budget-saving)",
          text: "var(--budget-saving-text)",
        },
        "breathing-low": {
          DEFAULT: "var(--budget-breathing-low)",
          text: "var(--budget-breathing-low-text)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        full: "9999px",
      },
    },
  },
  safelist: [
    {
      // Tremor builds chart color classes (fill-teal-500, stroke-rose-500, etc.) via
      // template literals at runtime — Tailwind's scanner never sees them, so they'd
      // be purged. This safelist forces all combinations into the bundle.
      pattern:
        /^(fill|stroke|bg|text|border|ring)-(teal|indigo|violet|rose|orange|amber|lime|cyan|slate)-(50|100|200|300|400|500|600|700|800|900)$/,
      variants: ["dark", "hover"],
    },
  ],
  plugins: [tailwindcssAnimate],
} satisfies Config;

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
      colors: {
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
  plugins: [tailwindcssAnimate],
} satisfies Config;

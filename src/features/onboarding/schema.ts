import { z } from "zod";

export const SUPPORTED_CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "INR", name: "Indian Rupee" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "ZAR", name: "South African Rand" },
  { code: "LKR", name: "Sri Lankan Rupee" },
  { code: "MYR", name: "Malaysian Ringgit" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map(
  (c) => c.code,
) as unknown as [CurrencyCode, ...CurrencyCode[]];

export const nameStepSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "Enter your name")
    .max(50, "Name must be 50 characters or fewer"),
});

export const currencyStepSchema = z.object({
  currency: z.enum(CURRENCY_CODES),
});

export type OnboardingProfile = {
  user_id: string;
  display_name: string | null;
  currency: string;
  onboarding_step: number;
  onboarding_completed_at: string | null;
};

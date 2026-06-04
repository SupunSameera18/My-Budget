import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be 128 characters or fewer");

export const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: passwordSchema,
});

export const signUpSchema = z
  .object({
    email: z.string().email("Enter a valid email address"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const resetPasswordWithOtpSchema = z
  .object({
    email: z.string().email("Enter a valid email address"),
    otp: z
      .string()
      .trim()
      .length(6, "Enter the 6-character code from your email"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignInFormValues = z.infer<typeof signInSchema>;
export type SignUpFormValues = z.infer<typeof signUpSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
export type UpdatePasswordFormValues = z.infer<typeof updatePasswordSchema>;
export type ResetPasswordWithOtpFormValues = z.infer<
  typeof resetPasswordWithOtpSchema
>;

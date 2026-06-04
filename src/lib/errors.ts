export enum ErrorCode {
  ProfileCreateFailed = "profile_create_failed",
  SignInFailed = "sign_in_failed",
  SignUpFailed = "sign_up_failed",
  PasswordResetFailed = "password_reset_failed",
  UpdatePasswordFailed = "update_password_failed",
  OAuthFailed = "oauth_failed",
  // ↓ Added by Story 1.7
  AccountCreateFailed = "account_create_failed",
  AccountFetchFailed = "account_fetch_failed",
  // ↓ Added by Story 2.1
  AccountUpdateFailed = "account_update_failed",
  AccountArchiveFailed = "account_archive_failed",
  AccountDeleteFailed = "account_delete_failed",
  // ↓ Added by Story 1.8
  ProfileFetchFailed = "profile_fetch_failed",
  CurrencySaveFailed = "currency_save_failed",
  OnboardingCompleteFailed = "onboarding_complete_failed",
  // ↓ Added by Story 1.9
  ChecklistUpdateFailed = "checklist_update_failed",
  // ↓ Added by Story 1.10
  TransactionCreateFailed = "transaction_create_failed",
  // ↓ Added by Story 1.11
  BreathingRoomFetchFailed = "breathing_room_fetch_failed",
  // ↓ Added by Story 2.2
  TransferCreateFailed = "transfer_create_failed",
}

export type AppError = {
  code: ErrorCode;
  message: string;
  field?: string;
};

export type Result<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

export function ok(): Result<void>;
export function ok<T>(data: T): Result<T>;
export function ok<T>(data?: T): Result<T> {
  return { ok: true, data: data as T };
}

export function err(
  code: ErrorCode,
  message: string,
  field?: string,
): Result<never> {
  return { ok: false, error: { code, message, field } };
}

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
  // ↓ Added by Story 3.3
  TransactionUpdateFailed = "transaction_update_failed",
  TransactionDeleteFailed = "transaction_delete_failed",
  TransactionFetchFailed = "transaction_fetch_failed",
  // ↓ Added by Story 1.11
  BreathingRoomFetchFailed = "breathing_room_fetch_failed",
  // ↓ Added by Story 2.2
  TransferCreateFailed = "transfer_create_failed",
  // ↓ Added by Story 2.4
  CategoryCreateFailed = "category_create_failed",
  CategoryFetchFailed = "category_fetch_failed",
  CategoryUpdateFailed = "category_update_failed",
  CategoryArchiveFailed = "category_archive_failed",
  CategoryDeleteFailed = "category_delete_failed",
  // ↓ Added by Story 2.5
  SubcategoryCreateFailed = "subcategory_create_failed",
  SubcategoryFetchFailed = "subcategory_fetch_failed",
  SubcategoryUpdateFailed = "subcategory_update_failed",
  SubcategoryArchiveFailed = "subcategory_archive_failed",
  SubcategoryDeleteFailed = "subcategory_delete_failed",
  SubcategoryToggleFailed = "subcategory_toggle_failed",
  // ↓ Added by Story 4.1
  BudgetCreateFailed = "budget_create_failed",
  BudgetFetchFailed = "budget_fetch_failed",
  BudgetUpdateFailed = "budget_update_failed",
  BudgetArchiveFailed = "budget_archive_failed",
  // ↓ Added by Story 4.4
  LoggingGridFetchFailed = "logging_grid_fetch_failed",
  // ↓ Added by Story 4.5
  GoalCreateFailed = "goal_create_failed",
  GoalFetchFailed = "goal_fetch_failed",
  ContributionCreateFailed = "contribution_create_failed",
  // ↓ Added by Story 4.6
  GoalUpdateFailed = "goal_update_failed",
  // ↓ Added by Story 5.1
  MacroCreateFailed = "macro_create_failed",
  MacroUpdateFailed = "macro_update_failed",
  MacroArchiveFailed = "macro_archive_failed",
  MacroFetchFailed = "macro_fetch_failed",
  // ↓ Added by Story 5.2b
  MacroApplyFailed = "macro_apply_failed",
  // ↓ Added by Story 6.3
  ProfileUpdateFailed = "profile_update_failed",
  // ↓ Added by Story 6.7
  DataExportFailed = "data_export_failed",
  // ↓ Added by Story 7.2
  InviteGenerateFailed = "invite_generate_failed",
  InviteRevokeFailed = "invite_revoke_failed",
  InviteNotFound = "invite_not_found",
  InviteRateLimitExceeded = "invite_rate_limit_exceeded",
  FamilyFull = "family_full",
  AlreadyInFamily = "already_in_family",
  InviteOwnCode = "invite_own_code",
  InviteRedeemFailed = "invite_redeem_failed",
  InvitePreviewFailed = "invite_preview_failed",
  FamilyStatusFetchFailed = "family_status_fetch_failed",
  // ↓ Added by Story 7.4
  NotInFamily = "not_in_family",
  PrivacyToggleFailed = "privacy_toggle_failed",
  // ↓ Added by Story 7.5
  TransactionDefaultsSaveFailed = "transaction_defaults_save_failed",
  // ↓ Added by Story 7.6
  SplitTransactionFailed = "split_transaction_failed",
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

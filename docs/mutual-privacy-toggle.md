# Mutual Privacy Toggle — Removed Feature Archive

Removed in migration `0036_personal_always_private.sql`.  
Keep this file if you want to re-implement it as an optional user preference in future.

---

## What it was

A family-wide setting that let either partner expose their Personal transactions to the other.
When both partners had the toggle **off** (default), they could see each other's Personal transactions.
When either partner flipped it **on**, Personal transactions were hidden for **both** partners simultaneously — symmetric by design.

The current model (post-0036) makes Personal transactions permanently owner-only; this feature
is the only mechanism that ever allowed cross-partner Personal visibility.

---

## Data model

### `family_members.hide_personal` (BOOLEAN NOT NULL DEFAULT false)
Added in migration `0023_family_schema.sql`.

| `hide_personal` (alice) | `hide_personal` (bob) | Partner sees Personal? |
|---|---|---|
| false | false | ✅ Yes (mutual sharing active) |
| true | false | ❌ No (alice opted out — OR logic) |
| false | true | ❌ No (bob opted out — OR logic) |
| true | true | ❌ No |

The OR logic made it **symmetric**: one partner opting out hid both partners' Personal transactions
from each other (while owners always saw their own via Condition 1 of the predicate).

---

## RLS predicate (the Personal branch)

In `auth_can_view_transaction()` (SECURITY DEFINER), the else-branch that handled
`p_is_shared = false` for a non-owner looked like this (from migration `0035_fix_personal_visibility.sql`,
which was the last correct version before removal):

```sql
ELSE
  -- Personal: visible only when mutual sharing is ON for both members.
  SELECT
    (SELECT hide_personal FROM public.family_members
      WHERE family_unit_id = v_family_unit_id AND user_id = v_caller),
    (SELECT hide_personal FROM public.family_members
      WHERE family_unit_id = v_family_unit_id AND user_id = p_owner_id)
  INTO v_caller_hide, v_owner_hide;

  IF COALESCE(v_caller_hide, false) OR COALESCE(v_owner_hide, false) THEN
    RETURN false;
  END IF;

  -- Mutual sharing ON (both hide=false): partner can see Personal transaction
  RETURN true;
END IF;
```

Post-0036, this entire branch is replaced with `RETURN false` (Personal = always owner-only).

The predicate also declared two local variables that are no longer needed:
```sql
v_caller_hide BOOLEAN;
v_owner_hide  BOOLEAN;
```
And no longer needed the `v_viewer_join_date DATE` variable in the else-branch
(it was only used by the old Personal join-date check from migration 0034).

---

## Server action

`src/features/family/server/actions.ts` contained two functions:

### `updatePrivacyToggle(enabled: boolean): Promise<Result<void>>`
Updated `family_members.hide_personal` for the authenticated user:
```typescript
const { data, error } = await auth.supabase
  .from("family_members")
  .update({ hide_personal: enabled })
  .eq("user_id", auth.user.id)
  .select("id");

if (error) return err(ErrorCode.PrivacyToggleFailed, "...");
if (!data || data.length === 0) return err(ErrorCode.NotInFamily, "...");
return ok();
```

### `getHidePersonal(): Promise<boolean>`
Read back the current user's `hide_personal` flag:
```typescript
const { data } = await auth.supabase
  .from("family_members")
  .select("hide_personal")
  .eq("user_id", auth.user.id)
  .single();
return data?.hide_personal ?? false;
```

Both functions were removed from `actions.ts`. Their full test suites lived in
`actions.test.ts` under `describe("updatePrivacyToggle")` and `describe("getHidePersonal")`.

---

## UI component: `PrivacyToggle`

`src/features/family/components/PrivacyToggle.tsx` — client component, optimistic update.

```tsx
interface PrivacyToggleProps {
  initialValue: boolean;   // current hide_personal from server
  isFamilyMode: boolean;   // hidden via HTML `hidden` attr in solo mode
}
```

Rendered on the Family page (`src/app/(app)/family/page.tsx`) inside the `in_family` branch,
with `initialValue={hidePersonal}` (fetched in parallel via `getHidePersonal()`).
Also rendered hidden in solo mode to pre-register the `aria-live` region with screen readers:
```tsx
<PrivacyToggle initialValue={false} isFamilyMode={false} />
```

The component used `useTransition` for optimistic toggle + revert-on-error.
Full test suite lived in `PrivacyToggle.test.tsx` (rendering, optimistic update, accessibility).

---

## Error codes removed from `src/lib/errors.ts`

```typescript
NotInFamily = "not_in_family",           // Story 7.4
PrivacyToggleFailed = "privacy_toggle_failed",  // Story 7.4
```

---

## pgTAP tests removed / rewritten

| File | Change |
|---|---|
| `supabase/tests/privacy_toggle.test.sql` | Full rewrite — now tests the always-private invariant (no toggle) |
| `supabase/tests/rls_visibility_predicate.test.sql` | Scenarios S7–S10, S12 updated; toggle state removed |
| `supabase/tests/family_schema.test.sql` | 4 assertions for `hide_personal` column removed (plan 31→27) |
| `supabase/tests/join_date_visibility.test.sql` | V3 scenario updated — hide_personal removed from seed INSERT |

The original `privacy_toggle.test.sql` (Story 7.4) tested four toggle scenarios (P1–P4) proving
the OR-logic symmetric behavior. Those 16 assertions are gone; the file now proves the simpler
invariant: personal transactions are unconditionally hidden from the partner.

---

## Re-implementation guide

To bring this feature back as a user preference:

1. **Add the column back:**
   ```sql
   ALTER TABLE public.family_members
     ADD COLUMN hide_personal BOOLEAN NOT NULL DEFAULT false;
   ```

2. **Restore the Personal branch** in `auth_can_view_transaction()` (see SQL above).

3. **Add a server action** to update and read the flag (see TypeScript above).

4. **Restore `PrivacyToggle` component** and wire it back into the Family page.

5. **Restore error codes** `NotInFamily` and `PrivacyToggleFailed` in `errors.ts`.

6. **Restore pgTAP tests** — the original `privacy_toggle.test.sql` (16 assertions, P1–P4 scenarios)
   and the corresponding S7–S10/S12 scenarios in `rls_visibility_predicate.test.sql`.

Consider making the default `hide_personal = true` (hide by default) so the new column
matches the permanent-privacy behavior users are accustomed to from post-0036, and then
let users opt in to mutual sharing rather than opting out of it.

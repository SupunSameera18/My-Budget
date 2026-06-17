-- 0053_close_former_partner_activity_trail_access.sql
-- Phase 2 Task 3c: close a deferred gap from Story 7.7's review (item [7-7]):
--
--   "Former partner retains visibility into their own historical activity
--    trail entries after leaving the family — the 0024 RLS policy's
--    `user_id = auth.uid()` branch has no temporal/membership guard, so a
--    former member can still read their own trail entries." (deferred at
--    the time — v1 has no "leave family" flow, so it was unreachable, but
--    Phase 2 closes all deferred gaps regardless of reachability today.)
--
-- The 0024 policy granted blanket SELECT on any activity_trail row the
-- caller authored (`user_id = auth.uid()`), regardless of whether the
-- caller can still view the underlying transaction. That's correct for a
-- transaction the caller OWNS (their own edit history on their own data
-- should always be visible), but wrong for an edit the caller made on a
-- *Shared transaction owned by someone else* — if the caller later loses
-- family-membership context with that owner, they should lose visibility
-- into that historical entry too, exactly as they lose visibility into the
-- transaction itself.
--
-- Fix: replace the "I authored it" branch with "I own the underlying
-- transaction" (always visible — own data) OR "I can currently view the
-- underlying transaction" (covers both partners while still in the family;
-- evaporates the moment auth_can_view_transaction would deny it, e.g. after
-- leaving the family or the transaction is reclassified Shared→Personal —
-- already covered by the existing AC14/S4 behavior, this migration extends
-- the same guarantee to historical trail entries).

DROP POLICY IF EXISTS "activity trail visibility" ON public.activity_trail;

CREATE POLICY "activity trail visibility"
  ON public.activity_trail
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = activity_trail.transaction_id
        AND t.user_id = auth.uid() -- own transaction: always visible (own data)
    )
    OR EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = activity_trail.transaction_id
        AND public.auth_can_view_transaction(t.user_id, t.is_shared, t.date)
    )
  );

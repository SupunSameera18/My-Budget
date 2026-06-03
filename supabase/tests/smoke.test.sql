-- pgTAP smoke test (Story 1.1): proves the DB test gate runs green with zero
-- domain tables. Real RLS / money-math pgTAP suites arrive in later stories.
begin;

select plan(1);

select pass('pgTAP harness is wired');

select * from finish();

rollback;

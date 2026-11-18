-- The day rate in force when the Reservation was created at checkout
-- (D-63, D-21; issue #238). Expand-only (D-30), nullable: a row created
-- before this migration has no snapshot and is never backfilled — its
-- true rate is unknown — so S-25 falls back to the current rate for it.
-- A recorded fact, not a price list: Catalog still owns the day rate.

alter table reservations
  add column if not exists day_rate_cents integer,
  add column if not exists day_rate_currency text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_day_rate_non_negative') then
    alter table reservations
      add constraint reservations_day_rate_non_negative
      check (day_rate_cents is null or day_rate_cents >= 0);
  end if;

  -- D-21: an amount always carries its currency.
  if not exists (select 1 from pg_constraint where conname = 'reservations_day_rate_with_currency') then
    alter table reservations
      add constraint reservations_day_rate_with_currency
      check ((day_rate_cents is null) = (day_rate_currency is null));
  end if;
end $$;

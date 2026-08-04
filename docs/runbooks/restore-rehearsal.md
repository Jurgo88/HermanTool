# Restore rehearsal (D-32, R-04, R-07; issue #72/IR-04)

An untested backup is a belief, not a mitigation. This is a **manual**
task — nothing in this repository can create a second Supabase project
or time a human running commands. Do this once nightly-backup.yml has
run successfully at least once (`workflow_dispatch` it manually to
check sooner than the schedule), and write the elapsed time down
wherever R-04/R-07's mitigation status is tracked.

## Steps

1. Create the second free Supabase project (R-05 already calls for one,
   for migration rehearsal — this reuses it, don't create a third).
2. Download the most recent dump from `R2_BUCKET_BACKUPS`'s `db-dumps/`
   prefix (e.g. via `rclone` or the Cloudflare dashboard).
3. Start a timer.
4. Decompress and restore:
   ```sh
   gunzip -c db-YYYY-MM-DDTHH-MM-SS-sssZ.sql.gz > restored.sql
   psql "$REHEARSAL_PROJECT_DIRECT_URL" -f restored.sql
   ```
   Use the rehearsal project's **direct** (session-mode) connection
   string, same reasoning as `scripts/backup-and-record.mjs`'s own
   `DATABASE_URL` — restoring is schema DDL plus bulk inserts, not
   pooler-friendly transaction-mode traffic.
5. Stop the timer once `psql` exits with no errors.
6. Spot-check: row counts on a few tables (`tenants`, `asset_types`,
   `reservations`) against what you expect, and that `select 1` and a
   simple `select * from job_runs order by started_at desc limit 5`
   both work.
7. Record: the elapsed time, the dump's size and date, and whether step
   6's spot-check passed. Tear down the rehearsal project's data (or
   the whole project) once done — it is not meant to become a second
   live copy.

## What this rehearsal does NOT cover

The `conditions` bucket copy (`conditions-backup/` in
`R2_BUCKET_BACKUPS`) is a separate restore path — copying R2 objects
back to a working bucket via `rclone` or the S3 API, not `psql`. Worth
rehearsing once too, but it is a much simpler operation (no schema, no
ordering) and less urgent to time.

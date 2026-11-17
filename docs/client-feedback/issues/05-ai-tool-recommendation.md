feat: AI tool recommendation on S-01 — describe the job, get 1–3 AssetTypes, with visitor limits and a monthly cap

## Context
Client feedback 15 Nov 2026, agreed 17 Nov 2026 — see
`docs/client-feedback/2026-11-15-poziadavky-klienta.md` §6.

A visitor describes what they need to do („vyvŕtať dieru do betónu na
poličku“) and gets 1–3 published AssetTypes with a one-sentence reason.

## Decisions (agreed with the owner)
**Scope**
- Input above the S-01 grid; D-54 filters stay alongside
- Output: 1–3 AssetType ids + one-sentence reason, optional safety note.
  **No how-to instructions**
- Cards link to S-02; no availability in the result (D-58)
- Model may return only ids of published AssetTypes; the server validates and drops anything else.
  No match → „S týmto vám poradíme osobne“ + contact
- Server-side only (Nitro route); API key never reaches the client (D-25)

**Limits**
- Per visitor: 10 / hour, 30 / day. A Visitor is not a Customer (Part 2), so the key is
  an HMAC of the IP with a daily-rotated secret, discarded after 24 h — no raw IP stored
- Input max 500 characters (Zod)
- Monthly cap per Tenant, default **10 €**, editable in admin. Every call records token usage
  and cost (with currency, D-21); at the cap the input hides until month end, filters remain
- Bot protection (e.g. Turnstile) deferred until abuse is seen

**Stored questions**
- Question text + recommended AssetType ids + timestamp + Tenant. No IP, no Customer link
- E-mail addresses and phone numbers stripped before storage
- Retention **90 days**, legitimate interest; purge via a scheduled job recorded in the
  job-run ledger (D-41 / FR-40)
- Feeds a statistics section „Čo ľudia hľadali“, highlighting questions with no match

**Model:** proposed `claude-haiku-5-5` (~15 000 questions per 10 € at ~4k input /
~500 output tokens). Validate on ~30 sample Slovak questions before launch; fall back
to `claude-sonnet-5-5` (~800 per 10 €) if quality is insufficient. Model id in config.

## Scope
- [ ] ADR **D-64**: new processor (Anthropic), visitor question log as a deliberate
      exception to Part 2's "a Visitor leaves no record", retention basis
- [ ] Privacy page (sukromie.vue / i18n) + processor list (OQ #4)
- [ ] Migration (expand only): question log, usage ledger, Tenant setting for the cap
- [ ] Server module: prompt (stable catalog prefix, cached), structured output, id validation,
      refusal / error handling → graceful "no recommendation"
- [ ] Rate limiter (hour/day windows) + monthly cap check before calling the API
- [ ] S-01 input + result cards; four states (idle, loading, result, error/limit) — strings in app/i18n/sk.ts
- [ ] Admin: cap setting, month-to-date spend
- [ ] Retention purge job (90 days)
- [ ] Sample-question evaluation script + results recorded in the PR

## Invariants / tests
- [ ] FR-33: catalog in the prompt and stored questions are Tenant-scoped
- [ ] Never returns an unpublished, unknown or other-Tenant AssetType id (validation test)
- [ ] Rate limit: 11th call in an hour / 31st in a day refused; no raw IP persisted
- [ ] Cap reached → no API call is made
- [ ] PII scrub removes e-mails and phone numbers before insert
- [ ] Purge removes rows older than 90 days

## Governing identifiers
D-25, D-54, D-58, D-21, D-41, FR-33, FR-40, P7, OQ #4, Part 2 (Visitor), S-01

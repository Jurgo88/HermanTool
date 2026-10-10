// Keeps the Reservation draft in this browser's localStorage, so a reload or
// a closed tab does not lose the tools a Visitor picked. Read after
// hydration, not before: the server rendered an empty draft, and changing
// it earlier would make the header disagree with that HTML.
//
// Storage can be missing or refuse (a private window, blocked site data);
// then the draft simply lives as long as the page, as it did before.
import { DRAFT_STORAGE_KEY, parseStoredDraft } from '~/utils/reservation-draft'

export default defineNuxtPlugin((nuxtApp) => {
  const { lines, restored } = useReservationDraft()

  nuxtApp.hook('app:mounted', () => {
    try {
      const stored = parseStoredDraft(localStorage.getItem(DRAFT_STORAGE_KEY))
      if (lines.value.length === 0) lines.value = stored
    } catch {
      // No storage: nothing to restore.
    }
    restored.value = true

    // Synchronous, so a draft cleared right before leaving for the payment
    // page is cleared in storage too.
    watch(
      lines,
      (value) => {
        try {
          if (value.length === 0) localStorage.removeItem(DRAFT_STORAGE_KEY)
          else localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(value))
        } catch {
          // No storage: the draft lives as long as the page.
        }
      },
      { deep: true, flush: 'sync' },
    )
  })
})

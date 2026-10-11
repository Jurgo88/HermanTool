// Keeps the Reservation draft in this browser's localStorage, so a reload or
// a closed tab does not lose the tools a Visitor picked. Read after
// hydration, not before: the server rendered an empty draft, and changing
// it earlier would make the header disagree with that HTML.
//
// Storage can be missing or refuse (a private window, blocked site data);
// then the draft simply lives as long as the page, as it did before.
import {
  DRAFT_STORAGE_KEY,
  PENDING_GROUP_STORAGE_KEY,
  parseStoredDraft,
  parseStoredGroupId,
} from '~/utils/reservation-draft'

export default defineNuxtPlugin((nuxtApp) => {
  const { lines, restored, pendingGroupId } = useReservationDraft()

  nuxtApp.hook('app:mounted', () => {
    try {
      const stored = parseStoredDraft(localStorage.getItem(DRAFT_STORAGE_KEY))
      if (lines.value.length === 0) lines.value = stored
      pendingGroupId.value ??= parseStoredGroupId(localStorage.getItem(PENDING_GROUP_STORAGE_KEY))
    } catch {
      // No storage: nothing to restore.
    }
    restored.value = true

    // Synchronous, so what checkout sets right before leaving for the
    // payment page reaches storage before the browser goes.
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

    watch(
      pendingGroupId,
      (value) => {
        try {
          if (value === null) localStorage.removeItem(PENDING_GROUP_STORAGE_KEY)
          else localStorage.setItem(PENDING_GROUP_STORAGE_KEY, String(value))
        } catch {
          // No storage: resuming works only within this page.
        }
      },
      { flush: 'sync' },
    )
  })
})

// Page meta keys this app reads (layouts/public.vue).
declare module '#app' {
  interface PageMeta {
    // The page opens with <PublicHero>; the header joins it.
    hero?: boolean
  }
}

export {}

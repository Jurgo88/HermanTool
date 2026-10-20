// D-51: the one formatting module lives in shared/format.ts so the server can
// format the same way the app does (Customer emails, #189). Every existing
// import of ~/utils/format keeps working through this re-export.
// Keep the alias: `nuxt build` bundles this file from its build directory,
// where a relative path no longer reaches shared/. The dev-time unimport
// warning about it is harmless.
export * from '#shared/format'

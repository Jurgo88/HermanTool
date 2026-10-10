// D-51: the one formatting module lives in shared/format.ts so the server can
// format the same way the app does (Customer emails, #189). Every existing
// import of ~/utils/format keeps working through this re-export.
export * from '../../shared/format'

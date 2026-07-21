# HermanTool
Rental software for Herman Tool

## Node version

This project runs **Node 26** — local, CI (GitHub Actions) and Netlify
must all match. Node 26 is a Current release as of this writing and
becomes Active LTS in October 2026; the pin here should move to the
Active LTS line before or shortly after that promotion.

Pinned in two places, both `26`: [`.nvmrc`](.nvmrc) (for `nvm`/`fnm`)
and [`.node-version`](.node-version) (for tools and Netlify that read
that file instead). `engines.node` in `package.json` enforces
`>=26.0.0 <27` at install time.

**Netlify:** Netlify reads `.nvmrc` / `.node-version` automatically, but
does *not* read `engines.node` from `package.json`. Since this repo
ships both files, a new Netlify site should pick up Node 26 without
extra configuration — but confirm this once the site exists, and if it
doesn't, set the `NODE_VERSION` environment variable to `26` explicitly
in Netlify's site settings as a fallback.

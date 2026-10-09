# Deployment

The output is plain static files in `dist/`. Every internal URL is relative (or built from `SITE_URL` for canonicals), so it works at a domain root or under `/repo-name/`.

## GitHub Pages (preferred)

The workflow `.github/workflows/pages.yml` validates, builds, checks, runs unit, integration and E2E tests, then deploys.

1. Create the repository (this project's `package.json` points at `razsekar/interviewos`). Push `main`.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. The workflow sets `SITE_URL=https://<owner>.github.io/<repo>/` automatically. For a custom domain, edit `SITE_URL` in the workflow (and `defaultSiteUrl` in `site.config.json`) and add the domain in Pages settings.
4. Optional secret `BANNED_TERMS`: comma-separated private terms that must never appear in published output. The build fails if any do.
5. First run: check the Actions log, then open the site and the app, install it, go offline and reload.

GitHub Pages serves `404.html` for unknown paths; `.nojekyll` is generated so nothing is filtered.

**Public repository warning.** GitHub Pages on a free account requires a public repository. Content JSON, tooling and reports are then public. `sources/` and `extracted/` are git-ignored, source names are aliased, and private terms are configurable rather than hard-coded, but review `git status` and `content/` before the first push.

## Vercel (static alternative)

Import the repository, framework preset **Other**, build command `npm run build`, output directory `dist`, environment variable `SITE_URL=https://<your-domain>/`. No server functions are used. Vercel can also add real response headers (CSP `frame-ancestors`, `Cache-Control`) via `vercel.json` if you want them.

## Local production check

```bash
npm run build && npm run check
npm run serve        # mounts dist/ at the production sub-path, e.g. /interviewos/
```
Use `PORT=...`, `SITE_URL=...` or `BASE_PATH=...` to change the mount.

## Cache headers

GitHub Pages sets short caching on everything, so updates appear quickly and the service worker handles repeat visits. On a host where you control headers, serve `assets/`, `icons/` and `data/` with a moderate max-age, `sw.js` and HTML with `no-cache`.

## Rollback

Revert the commit and re-run the workflow. Installed apps pick up the previous version through the normal update prompt (the service worker build id changes).

# Repository instructions

## Application architecture

- Keep the existing React/web application as the single source of truth for the website, PWA, and Capacitor Android app.
- Do not create a second React app, duplicate `src`, or maintain Android copies of web components.
- Keep native Android changes limited to wrapper/configuration work that cannot live in the web app.
- Preserve the existing Vite build, browser development workflow, routing, state, PWA behavior, and web UI.

## Android releases

- The root `package.json` `version` is the only application version to edit. Android reads it for `versionName` and derives `versionCode` from it.
- Never manually edit Android version fields in `android/app/build.gradle` for a release.
- When the user explicitly asks to “release a new APK”, “publish an APK”, “bump the app version”, or uses `/bump-version`, use the repository skill `$bump-version`.
- If no version or bump type is specified, `$bump-version` uses a patch bump by default.
- A normal feature change must not create or push a release tag. Only release it when the user explicitly requests a release.
- A release tag must exactly match the package version: `package.json` `1.2.3` means Git tag `v1.2.3`.
- Do not commit generated APKs, `dist`, or other build output.

## Verification

- Before release, run `npm test` and `npm run build:android`, plus any checks required by the change.
- Keep the working tree safe: preserve unrelated user changes and never overwrite or force-move an existing release tag.

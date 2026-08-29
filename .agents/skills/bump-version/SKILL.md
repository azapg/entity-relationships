---
name: bump-version
description: Safely bump this repository's package.json version and publish a matching Android APK release through the existing GitHub Actions workflow. Use when the user asks to bump or release a version, publish a new APK, release an Android build, or create a vX.Y.Z tag for this app.
---

# Bump Version

Use this skill to release the existing application without maintaining a separate Android version. `package.json` is the source of truth for the app version; Android derives its `versionName` and `versionCode` from it, and the release workflow requires the tag to match it.

## Determine the target version

- If the user gives an exact version or tag, use it after normalizing `v1.2.3` to `1.2.3`.
- If the user asks for a `major`, `minor`, or `patch` bump, apply that SemVer increment to the current `package.json` version.
- If the user says only “release a new APK” or equivalent, use a patch bump by default.
- Accept only stable `X.Y.Z` versions. Ask for clarification instead of guessing when the requested version or bump type is ambiguous.

## Release workflow

1. Inspect `git status`, the current branch, and the current `package.json` version. Preserve unrelated user changes. If the just-finished implementation is still uncommitted, commit only that clearly scoped work before the release version commit; never stage unrelated files automatically.

2. Run the repository checks appropriate for a release. At minimum run:

   ```bash
   npm test
   npm run build:android
   ```

   Use the repository's actual package-manager commands if its instructions require another package manager.

3. Update only the root `package.json` version with the chosen stable version. Prefer:

   ```bash
   npm version X.Y.Z --no-git-tag-version
   ```

   Do not edit `android/app/build.gradle` to change the version, and do not create a second version file. Do not commit generated APKs or ignored build output.

4. Verify the result before committing:

   ```bash
   node -p "require('./package.json').version"
   git diff -- package.json
   ```

   Confirm the value is exactly `X.Y.Z` and that the Android release tag will be `vX.Y.Z`.

5. Ensure `vX.Y.Z` does not already exist locally or on `origin`. Never move, overwrite, or force-push an existing release tag:

   ```bash
   git rev-parse --verify --quiet "refs/tags/vX.Y.Z"
   git ls-remote --exit-code --tags origin "refs/tags/vX.Y.Z"
   ```

6. Commit the version change, push the branch, then push the matching tag:

   ```bash
   git add package.json
   git commit -m "Bump version to X.Y.Z"
   git push origin HEAD
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   The tag push starts `.github/workflows/android-release.yml`, which builds and attaches the APK to the GitHub Release. If the workflow fails, diagnose it; do not create a replacement tag with the same name.

## Report the release

Report the selected version, version commit, tag, pushed branch, and GitHub Actions/Release URL when available. State any checks that could not run. Do not claim the APK is available until the workflow has completed successfully.

# Release workflow

Use this workflow when the user asks to release a version. The current-chat release request authorizes its commits, push, PR, merge, tag, and publication, as described in AGENTS.md. Documentation alone does not authorize a release.

## Prepare

1. Inspect `git status`, the full diff, recent commits, the latest GitHub release, and the previous release PR. Preserve existing work. Fetch `origin`, check divergence from `origin/main`, and create `release/VERSION`; resolve upstream changes before publishing.
2. Align `CFBundleShortVersionString` in `app/Info.plist`, `engine/package.json`, and `engine/src/client/package.json`. Increment the plist's `CFBundleVersion`. Move the completed changes from `Unreleased` into a dated `CHANGELOG.md` section and update the README download filename. Release notes and fixed UI copy use English; commit and PR text follows recent repository history.
3. Build the web client and refresh the committed screenshots for the new version using only `docs/screenshots/mock-api.json`. Update the expected version in `capture-all.js`, run the capture callbacks documented in `docs/screenshots/README.md`, and inspect changed views at normal and small sizes. Keep screenshot provenance current.

## Verify and package

4. Run `cd engine && bun run test`, `bun run typecheck`, and `zsh scripts/test.sh` from the repository root for the Swift suite. Run the focused browser checks for affected workflows, inspect the full diff, and run `git diff --check`. A failed required check stays incomplete until diagnosed and rerun successfully.
5. Keep release files in ignored `dist/release-VERSION/`. Build directly there with `KLIPRUN_APP_OUTPUT="$PWD/dist/release-VERSION/KlipRun.app" zsh scripts/build.sh`; this avoids replacing the user's running app. Confirm the plist version/build number, the web UI version, host architecture, and `codesign --verify --deep --strict` on that bundle. The published build is Apple Silicon (`arm64`), locally signed, and not notarized. Include required third-party notices in the signed bundle.
6. Create `KlipRun-VERSION-macos-arm64.zip` with `ditto -c -k --sequesterRsrc --keepParent`, containing a top-level `KlipRun.app`. Write its SHA-256 to `SHA256SUMS` using the archive basename. Extract the ZIP into a fresh temporary directory and verify its checksum, bundle version, architecture, and signature. Exercise the packaged engine's token-protected loopback API and affected functionality using disposable fixture data. Validate the archive through the production `AppUpdate` and `AppInstallation.prepare` path against a disposable copy of the previous version. This check must not install over or stop a user's app.

## Publish

7. Commit logical groups on `release/VERSION` (feature/fix, then release metadata/docs/screenshots), following recent commit naming. Push the branch and create a PR into `main` with the concrete changes, checks actually run, and artifact names. Use a body file for multiline text. Wait for applicable checks and resolve failures; merge with a merge commit after confirming the PR head is the verified branch head. Do not push feature work directly to `main`.
8. Fetch the merged `main`, fast-forward the local checkout, and confirm its source tree matches the tested release branch. Create and push an annotated `vVERSION` tag at the exact merge commit, then create the GitHub release with `--verify-tag`, titled `KlipRun Desktop VERSION`. Publish the prepared ZIP and `SHA256SUMS` with English release notes describing the changes and installation/update requirements. Mark the published stable release as latest. Do not overwrite an existing tag or release silently.
9. Read the public latest-release API, verify that `vVERSION` resolves to the merge commit, download both published assets into a fresh directory, and compare their checksums with the local files and GitHub's asset digest. Repeat production updater validation using the public release metadata and downloaded ZIP. Finish only when the PR is merged, the release is published, assets verify, and the local checkout is clean. Return the release and PR links plus a concise verification summary.

If a step is blocked, report the exact completed steps and remaining blocker. A local ZIP, draft PR, or unverified upload is not a completed release. Installing the release into the user's current app is a separate request.

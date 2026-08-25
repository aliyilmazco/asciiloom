# Open-Source Release Hardening Design

**Date:** 2026-08-25

## Goal

Prepare README ASCII Studio for an open-source repository and npm release without changing application behavior, generated examples, or the CLI-only npm package boundary.

## Scope

The release hardening covers four public-facing concerns:

1. Remove repository-specific internal infrastructure details from tracked historical notes.
2. Document the ownership and provenance of repository assets.
3. Add the minimum contributor, security, conduct, and release-history documents expected by a public project.
4. Make npm metadata point users to the source repository, deployed site, issue tracker, and project identity.

Existing source code, browser behavior, CLI behavior, examples, fixtures, workflow permissions, and the existing user-owned `package-lock.json` diff are outside the change scope.

## Chosen approach

Keep the existing historical `docs/superpowers` files because they describe implementation decisions and are already part of the repository history. Sanitize only the internal registry hostname, replacing it with a generic description that preserves the intent of the test plan without exposing infrastructure.

Add public policy documents at the repository root:

- `CONTRIBUTING.md` explains local setup, validation commands, scope expectations, and pull-request behavior.
- `SECURITY.md` directs suspected vulnerabilities away from public issues and toward GitHub private reporting.
- `CODE_OF_CONDUCT.md` defines respectful participation and a private enforcement route.
- `CHANGELOG.md` records the initial public release.
- `NOTICE.md` records project-owned/generated asset provenance and the existing inspiration attribution.

Add `repository`, `homepage`, `bugs`, and project-level `author` metadata to `package.json`. README links to the new documents use absolute GitHub URLs so the CLI-only npm package does not gain source-repository files merely to satisfy relative-link checks.

## Asset provenance

The maintainer has approved treating `examples/demo-source.png` as a project-owned/generated asset. The notice will state that it and the deterministic SVG fixtures, favicon, and generated example outputs are project assets distributed under the repository's MIT terms. The notice will separately identify the `khrome/ascii-art` project as inspiration, not as bundled code or an asset source.

## Verification

The implementation must preserve the existing release gate. After edits, run formatting checks, the repository check suite, the full release gate, a targeted search for the removed internal hostname, and `git status`/diff review. The task-owned diff must not include `package-lock.json` or generated directories; the pre-existing package-lock diff remains untouched.

## Non-goals

- No application-code refactor or behavior change.
- No removal of tracked historical design notes.
- No npm publish, GitHub Pages deployment, tag creation, or remote push.
- No reversal or overwrite of the pre-existing `package-lock.json` changes.

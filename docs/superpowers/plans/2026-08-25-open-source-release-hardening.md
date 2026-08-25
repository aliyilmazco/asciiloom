# Open-Source Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repository's public documentation, asset provenance, and npm metadata suitable for open-source publication while preserving all application behavior and existing user changes.

**Architecture:** Keep the runtime and generated artifacts unchanged. Add small root-level policy/release documents, add discoverability metadata to `package.json`, and sanitize only the internal infrastructure string in the historical hardening plan. Validate with the existing release gate and explicit scope checks.

**Tech Stack:** Markdown, npm package metadata, GitHub Actions documentation, existing Node/Vitest/Playwright release scripts.

---

### Task 1: Add public release metadata and README links

**Files:**

- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add source and maintainer metadata**

Add these fields after `license` in `package.json`:

```json
"author": "README ASCII Studio contributors",
"repository": {
  "type": "git",
  "url": "https://github.com/aliyilmazco/ascii-art-for-md.git"
},
"homepage": "https://aliyilmazco.github.io/ascii-art-for-md/",
"bugs": {
  "url": "https://github.com/aliyilmazco/ascii-art-for-md/issues"
},
```

- [ ] **Step 2: Link public project documents from README**

Add a short `Open-source project` section before `## License`, linking to the root documents through absolute GitHub URLs. Keep the npm package statement accurate: the npm tarball remains CLI-only.

- [ ] **Step 3: Document the project-owned demo asset**

Update the asset sentence near the README introduction to state that the committed demo source and deterministic fixture assets are project-owned/generated and described in `NOTICE.md`.

- [ ] **Step 4: Run metadata and formatting checks**

Run:

```bash
npm run format:check
node -e "const p=require('./package.json'); for (const key of ['author','repository','homepage','bugs']) if (!p[key]) throw new Error(key)"
```

Expected: Prettier reports all files matched and the Node assertion exits successfully.

### Task 2: Add contributor, security, conduct, and changelog documents

**Files:**

- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Add contribution instructions**

Document Node.js engine compatibility, `npm ci`, `npm run dev`, `npm run check`, `npm run release:check`, expected focused changes, generated-directory handling, and the requirement to include tests/docs for behavior changes.

- [ ] **Step 2: Add a private vulnerability-reporting policy**

Tell reporters not to open public issues for vulnerabilities, to use GitHub private vulnerability reporting/security advisories when enabled, and to contact the repository maintainers through GitHub if that channel is unavailable. State that supported security fixes follow the current `1.x` line.

- [ ] **Step 3: Add a concise code of conduct**

Use respectful, inclusive participation rules and direct enforcement concerns to the repository maintainers through a private GitHub channel. Do not invent an email address or external organization.

- [ ] **Step 4: Record the initial release**

Create a `1.0.0` changelog entry dated `2026-08-25` summarizing the browser studio, CLI, README-safe text/Markdown/SVG output, Unicode styles, local processing, and validation gate.

- [ ] **Step 5: Verify document links and spelling**

Run:

```bash
npx prettier --check CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md CHANGELOG.md
```

Expected: all four documents pass formatting.

### Task 3: Add asset provenance and sanitize historical infrastructure text

**Files:**

- Create: `NOTICE.md`
- Modify: `docs/superpowers/plans/2026-07-10-repository-hardening.md`

- [ ] **Step 1: Record project-owned assets and inspiration**

List `examples/demo-source.png`, deterministic SVG fixtures, the favicon, and generated example outputs as project-owned/generated assets. State that the repository's MIT license applies to these project assets and identify `khrome/ascii-art` only as inspiration with the existing README attribution.

- [ ] **Step 2: Replace the internal registry hostname**

In the historical plan's example check, replace the literal internal hostname with the phrase `the internal registry hostname` and keep the example's rejection behavior unchanged. Replace the final checklist's literal search term with `internal registry hostname`.

- [ ] **Step 3: Confirm the sensitive string is gone**

Run:

```bash
if rg -n -i 'packages[.][A-Za-z0-9-]+[.]internal' docs/superpowers/plans/2026-07-10-repository-hardening.md; then exit 1; fi
```

Expected: no matches.

### Task 4: Run the full release validation

**Files:**

- No source or generated files are intentionally modified by this task.

- [ ] **Step 1: Run the standard repository check**

Run `npm run check` and require successful lockfile validation, typechecks, lint, formatting, and unit/browser tests.

- [ ] **Step 2: Run the complete release gate**

Run `npm run release:check` with a writable npm cache if the local npm cache has permission problems. Require successful audit, coverage, web/CLI build, Chromium E2E, compiled CLI tests, example regeneration, and npm package verification.

- [ ] **Step 3: Review the final scope**

Run:

```bash
git diff --check
git status --short --branch
git diff --name-only
```

Expected: the task-owned changes are limited to the approved documentation/metadata files; the pre-existing `package-lock.json` modification remains untouched; generated directories remain ignored.

- [ ] **Step 4: Commit only the approved release-hardening files**

If committing is desired for the release branch, stage the explicit new/modified documentation and metadata paths only. Do not stage `package-lock.json`, `dist/`, `dist-cli/`, `coverage/`, `test-results/`, or `.DS_Store` files.

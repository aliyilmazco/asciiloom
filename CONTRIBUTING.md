# Contributing

Thank you for helping improve Charosaic. The project keeps the browser studio, CLI, and conversion core in one TypeScript repository, so focused changes and reproducible checks are especially valuable.

## Development setup

Requirements are Node.js `20.19.x` or an even-numbered release from `22.12.x` onward. Install the locked dependency graph with:

```bash
npm ci
```

Start the browser studio locally with:

```bash
npm run dev
```

The CLI can be exercised from source with `npm run cli -- <image> [options]`.

## Validation

Before opening a pull request, run the focused checks relevant to the change. The normal repository gate is:

```bash
npm run check
```

The complete release gate is:

```bash
npm run release:check
```

The release gate includes dependency auditing, coverage, production builds, Chromium browser tests, compiled-CLI tests, example regeneration, and npm package verification. It may download Chromium and npm dependencies on a fresh machine.

## Change expectations

- Keep changes focused on one behavior or documentation concern.
- Preserve the shared browser/CLI core contract and committed example outputs unless the change intentionally updates both the behavior and its documentation.
- Add or update tests for behavior changes and update README or policy documentation when user-facing behavior changes.
- Do not commit `node_modules/`, `dist/`, `dist-cli/`, `coverage/`, `playwright-report/`, `test-results/`, `.DS_Store`, or local logs.
- Do not include credentials, private keys, local absolute paths, or private registry URLs.
- Run Prettier on changed Markdown, JSON, and source files; `npm run format:check` is the final formatting check.

## Pull requests

Describe the user-visible result, the files or boundaries changed, and the validation commands that passed. Call out any platform-specific limitation or manual browser check that was not available. Keep unrelated worktree changes out of the pull request.

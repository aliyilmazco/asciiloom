# README ASCII Studio Final Hardening Design

**Design status:** Implemented and verified on 2026-07-10.

## Context

The repository already has a strict TypeScript core, browser worker rendering, a Sharp-based CLI,
unit and integration tests, coverage thresholds, and GitHub Pages deployment. A second independent
review found correctness, accessibility, portability, and release-gating gaps that the existing green
test suite does not exercise.

The current directory has no `.git` metadata. Source changes and local verification are possible, but
commits, branch operations, pushes, and pull requests remain out of scope until Git metadata is
restored.

## Goals

1. Preserve every requested ASCII row across text, Markdown, and SVG output, including terminal blank
   rows produced by trimmed spaces.
2. Keep existing destination file permissions when the CLI atomically replaces a file.
3. Reject invalid format-specific CLI input before image metadata, decoding, conversion, or output
   writes.
4. Make browser range controls expose stable accessible names while their displayed values change.
5. Bound custom-preset imports and keep generated duplicate names valid and persistable.
6. Make Unicode validation and SVG sizing behavior deterministic across output formats.
7. Ensure pull-request CI exercises every release gate and that deployment credentials are scoped to
   the deployment job.
8. Replace the `src/main.ts` coverage blind spot with executable tests around browser orchestration.
9. Keep dependency provenance checks, workflow references, platform coverage, and implementation
   documentation aligned with the hardened repository.

## Non-goals

- Redesigning the terminal-style interface.
- Changing the intended ASCII tone mapping, presets, or committed example artwork.
- Introducing a frontend framework, backend, analytics, uploads, or remote image processing.
- Publishing the private npm package or raising the Node.js minimum above 20.19.0.
- Replacing the worker, CLI, or preset architecture wholesale when a focused extraction is sufficient.

## Design

### 1. Row-preserving formatter contract

`convertRgbaToAscii` returns exactly `height` logical rows joined by newline separators and does not add
an extra file-terminating newline. Formatters must therefore normalize CRLF/CR to LF without removing
terminal LF separators that encode blank rows.

Markdown fencing will operate on the normalized art unchanged and add only the newline required to
separate the content from the closing fence. SVG will split the normalized art without trimming it,
emit one `tspan` per logical row, and derive height from that row count. Empty input remains one empty
logical row. Tests will cover all-empty art, non-empty art with terminal blank rows, and ordinary art
without changing the existing golden fixtures.

### 2. Atomic file replacement with metadata preservation

Before creating a sibling temporary file, the CLI will inspect an existing destination. If it is a
regular file, the temporary file will receive the destination's permission bits before rename. A new
destination continues to use the process umask. Directory rejection and input/symlink/hard-link
collision checks remain unchanged.

Metadata preservation applies only to permission bits. Ownership, ACLs, extended attributes, and
platform-specific metadata are not copied because doing so would require a broader deployment and
privilege contract. POSIX regression tests will verify `0600` remains `0600`; cross-platform tests will
assert content and collision behavior without assuming POSIX modes.

### 3. Early format-specific CLI validation

Argument parsing remains responsible for general option validation. After parsing and before metadata
lookup, `runCli` will validate output-format inputs that do not depend on pixels. For SVG or `all`, this
includes title/XML text validation. Markdown collapsible summaries will also be validated for the text
contract they use.

The formatter validation helpers will be shared rather than duplicated. Invalid titles must fail before
`metadata`, `preflight`, `loadImage`, conversion, or write callbacks are invoked. The `--` option
terminator will stop negative-number normalization so positional tokens retain their literal meaning.

### 4. Unicode and SVG geometry

Shared ramp validation will reject unpaired UTF-16 surrogates in addition to control characters. This
ensures a ramp accepted by the core can be emitted consistently as UTF-8 text, Markdown, and XML.

SVG sizing will use terminal-cell display width rather than raw Unicode code-point count. Combining
marks, variation selectors, and zero-width joiners contribute zero cells; East Asian wide/full-width
code points and extended pictographic code points contribute two cells. Multi-code-point emoji may
therefore be overestimated rather than clipped. The calculation remains deterministic and
dependency-free. Tests will cover ASCII, combining marks, CJK, emoji, and invalid surrogates.

### 5. Stable range-control accessibility

Each range input will have a stable explicit label containing only the control name. The visual numeric
`output` will sit outside the accessible-name subtree or be hidden from it, while the native range value
communicates the current number. Where formatted precision is important, `aria-valuetext` will be
updated together with the visible output.

Preset application and direct range input must update visible text and accessible value without changing
the accessible name. DOM tests will assert the stable label and updated `aria-valuetext`; a production
browser smoke check will confirm the accessibility snapshot no longer retains initial values such as
`Width 88` after the slider becomes 96.

### 6. Bounded custom-preset persistence

Custom presets will have explicit limits of 100 persisted presets and a 1 MiB import file. JSON files
will be rejected before `file.text()` when `File.size` exceeds 1,048,576 bytes. Parsed arrays and merges
will be rejected when the resulting collection would exceed 100 records. These limits keep DOM
rendering, name allocation, and localStorage operations bounded while remaining well above normal
interactive use.

Duplicate-name suffixes will reserve room inside the existing 80-character maximum. A duplicated
80-character name will be truncated before appending ` (2)`, and every generated name will be validated
before persistence. Import merging will avoid repeatedly cloning the growing collection; it will build
the result in a single bounded pass. Validation failures will remain distinct from browser-storage
permission failures.

### 7. Testable browser orchestration

`src/main.ts` will remain the Vite entry point but will no longer own all stateful orchestration directly.
The remaining application wiring will move behind a focused `createBrowserApp` boundary whose DOM,
worker client, storage, timers, clipboard, URL, and image loader dependencies can be supplied in tests.
The entry point will create those browser dependencies and call the application factory.

The factory tests will execute preset selection/import, render scheduling, image lifecycle, output-tab,
copy/download, and disposal wiring. Thin environment bootstrap code may remain excluded from coverage;
the logic-bearing orchestration module must be included and meet the repository thresholds.

### 8. Release and workflow hardening

Pull-request CI verifies Node 20.19.0, Node 22, Node 24, and Node 26 with the repository checks,
production builds, and compiled-CLI integration tests. A separate release-gate job runs coverage,
production builds, compiled-CLI integration tests, and golden-example verification before merge. Pages
will continue to depend on a verified build artifact.

Workflow permissions will default to `contents: read`. `pages: write` and `id-token: write` will exist
only on the deployment job. Every third-party action will be pinned to a reviewed full commit SHA with a
version comment, including the current checkout major. A small OS matrix will run the compiled CLI safety
suite on Ubuntu, Windows, and macOS without duplicating the full coverage workload.

The lockfile checker will parse `package-lock.json`, require HTTPS, and allow only
`registry.npmjs.org` for every resolved package URL. It will also require integrity metadata where npm's
lockfile format supplies a resolved registry artifact.

### 9. Documentation state

The README validation section will describe the expanded PR release gate, platform smoke matrix, preset
limits, Unicode SVG behavior, and permission-preserving atomic writes. Historical implementation plans
will be marked completed and their obsolete caveats removed. Generated `dist`, `dist-cli`, and coverage
directories remain ignored validation artifacts.

## Error handling

- Row preservation is structural and silent; no formatter warning is required.
- Invalid CLI text and Unicode input fails before expensive image operations with a specific message.
- Preset file-size, record-count, name, and storage errors use distinct actionable messages.
- Permission preservation failures abort before rename and remove the temporary file.
- Browser orchestration disposal remains idempotent and suppresses stale async results.
- CI and Pages stop before artifact upload or deployment when any required gate fails.

## Testing strategy

1. Add focused failing tests for each reproduced formatter, file-mode, CLI-ordering, terminator, surrogate,
   SVG-width, accessible-label, preset-limit, and naming defect.
2. Add executable tests for the extracted browser application boundary.
3. Run focused tests after each subsystem change.
4. Run `npm run release:check` under Node 20.19.0, Node 22, Node 24, and Node 26.
5. Run clean public-registry `npm ci`, full `npm audit`, `actionlint`, and workflow syntax checks.
6. Run production browser smoke tests at desktop and 375×812 mobile widths, including accessibility
   state, dropdown placement, preset lifecycle, output tabs, overflow, and console logs.
7. Verify Windows and macOS CLI jobs through workflow structure locally with `actionlint`; actual hosted
   runner execution remains a post-push check because this checkout has no GitHub identity.

## Acceptance criteria

- Markdown and SVG preserve the exact logical row count of conversion output.
- Replacing a POSIX `0600` output leaves it `0600`.
- Invalid SVG/all-format titles never call metadata, preflight, pixel loading, conversion, or writing.
- `--` terminates numeric argument normalization.
- Accepted ramps contain no XML-invalid surrogate code points.
- SVG width accounts conservatively for wide and zero-width Unicode.
- Range controls keep stable accessible names after preset and direct value changes.
- Duplicate maximum-length preset names remain at most 80 characters and persist successfully.
- Oversized or excessive preset imports fail before unbounded parsing/rendering/persistence work.
- Logic-bearing browser orchestration is executable under tests and included in coverage.
- PR CI enforces coverage, compiled CLI, golden examples, and production builds.
- Pages build jobs have no deployment write/OIDC permission; deploy jobs have only required permissions.
- Action references are immutable SHAs and workflow syntax passes `actionlint`.
- The public lockfile contains only HTTPS `registry.npmjs.org` resolved URLs.
- Node 20, Node 22, Node 24, and Node 26 release checks, audit, examples, and desktop/mobile browser smoke tests pass.
- No verified Critical, Important, or Minor review finding remains.

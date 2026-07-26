# README ASCII Studio Repository Hardening Design

**Design status:** Implemented and verified on 2026-07-10. Later follow-up hardening is specified in `2026-07-10-final-hardening-design.md`.

## Context

README ASCII Studio is a local-first TypeScript application with two delivery surfaces:

- a Vite-built browser interface that decodes images locally and exports text, Markdown, and SVG;
- a Node.js CLI that uses Sharp and shares the pure conversion core with the browser.

The current baseline passes strict TypeScript checking, all 37 Vitest tests, the production web build, the CLI build, a CLI example-output comparison, and desktop/mobile browser smoke checks. `npm audit --omit=dev` reports no runtime dependency vulnerabilities and `npm outdated` reports no outdated packages in the current lock snapshot.

The audit nevertheless found correctness, safety, release, and maintainability gaps. The highest-risk gaps are unbounded derived image height before Canvas or Sharp allocation, stale asynchronous image loads replacing newer selections, the CLI being able to overwrite its own input, Markdown/SVG runtime validation gaps, and a lockfile whose resolved URLs point to an internal registry that GitHub-hosted runners cannot use.

During the audit, `index.html`, `src/main.ts`, `src/style.css`, and `tests/ui-contract.test.ts` changed outside the review tasks. The user instructed that every current file should be reviewed and fixed in sequence, so the latest on-disk versions are the implementation baseline and must be preserved unless a planned change explicitly replaces their behavior.

The local directory has no `.git` metadata and the connected GitHub application could not identify a matching installed repository. Work can be designed and edited locally, but commits, branch operations, remote history review, and pull-request publication remain unavailable until the checkout or `owner/repository` identity is restored.

## Goals

1. Prevent resource exhaustion, stale-result races, unsafe output paths, and malformed formatter output before expensive work or file writes occur.
2. Preserve the existing ASCII conversion appearance, default presets, text/Markdown/SVG formats, terminal-style interface, and local-only privacy model except where a documented defect requires a behavior change.
3. Separate browser orchestration, image loading, output generation, persistence, and CLI side effects into focused units with explicit interfaces.
4. Make dependency installation and GitHub Pages deployment reproducible on public GitHub-hosted runners.
5. Replace source-string-only confidence with behavior and integration tests around the actual failure boundaries.
6. Align README, examples, architecture notes, supported limits, and validation commands with the resulting implementation.

## Non-goals

- Replacing the terminal-style visual design or introducing a UI framework.
- Rewriting the image-to-ASCII algorithm or intentionally changing existing example art.
- Adding a backend, uploads, analytics, accounts, or remote image processing.
- Publishing the package to npm, deploying the site, pushing a branch, or opening a pull request.
- Raising the declared Node.js runtime floor beyond `>=20.19` in this refactor. Compatibility changes require a separate explicit decision.
- Adding arbitrary custom ramps to the browser UI; imported browser presets continue to use ramps representable by existing controls.

## Design principles

- Validate at trust boundaries and before allocation, decoding pipelines, or writes.
- Keep shared rules in the core rather than reimplementing different limits in browser, CLI, and preset import code.
- Prefer explicit errors to silent fallback when user input is invalid.
- Keep entry points thin and move logic behind testable functions or small controllers.
- Preserve deterministic output and use committed examples as golden compatibility fixtures.
- Deliver the refactor in independently testable stages; every stage must leave the repository buildable.

## Stage 1: Reproducible release and type-check foundation

### Dependency installation

Regenerate `package-lock.json` against `https://registry.npmjs.org/` so no `resolved` entry contains the internal OpenAI registry hostname. The dependency graph and integrity values remain lockfile-controlled. Add a validation check that fails if the internal hostname reappears.

### Script boundaries

Split package scripts into explicit responsibilities:

- `typecheck` performs non-emitting TypeScript validation;
- `test` runs Vitest once;
- `lint` and `format:check` provide static style gates;
- `build:web` and `build:cli` emit their respective artifacts;
- `clean:cli` removes `dist-cli` before CLI emission;
- `check` runs non-emitting quality gates without compiling the CLI twice;
- `release:check` runs `check`, both builds, CLI smoke tests, and example-output verification.

### TypeScript environments

Create a small shared strict base configuration and separate browser, Node/CLI, tests, and Vite configuration projects. Browser code receives DOM and Vite types but not Node globals. CLI code receives Node 20 types and NodeNext resolution but not DOM globals. Tests explicitly receive Vitest and the environment types they use. This prevents one surface from accidentally relying on another surface's ambient globals.

### GitHub workflows

CI tests Node.js `20.19.0`, the declared minimum, and Node.js `22.x`, the newer runtime already used by the repository workflow. GitHub Pages must run the same required verification before artifact upload, so a failing type check or test cannot still deploy. Build jobs use `npm ci` against the public lockfile and clean generated outputs before emission.

## Stage 2: Shared core safety and formatter validation

### Shared validation module

Add a focused core validation module that owns:

- maximum output width and height of 400 cells;
- finite, positive source dimensions and cell aspect ratio;
- integer output dimensions;
- complete `AsciiOptions` runtime validation, including booleans, supported dithering modes, exact RGB channels, percentiles, and ramp length;
- a maximum of 65,536 Unicode code points per ramp, matching the complete index range of `Uint16Array`;
- a `resolveOutputDimensions` function that calculates and validates width and height before browser Canvas or Sharp allocation.

The browser retains its narrower UI width range of 24–180 columns, while the shared conversion API and CLI retain 2–400 columns. Automatically derived heights above 400 are rejected with an actionable message instructing CLI users to pass `--height` or browser users to choose a less extreme source/crop.

`convertRgbaToAscii` continues to validate direct API calls, but browser and CLI entry points call the shared validator before image preparation so invalid options never reach expensive work.

### Core performance

Auto-leveling sorts luminance values once and obtains both quantiles from that sorted data. When local detail is zero, the Gaussian blur allocation and pass are skipped. These optimizations must not change the existing output fixtures.

### Presets

Expose built-in presets as readonly data. Unknown preset identifiers throw or return an explicit absence instead of silently selecting the first preset. Nested background settings are merged and cloned correctly so future presets cannot lose their background override.

### Markdown

Keep dynamic fence collision handling. Validate the optional language identifier as a single safe info-string token; line breaks, fence characters, or other structural Markdown input are rejected. Collapsible summaries remain HTML-escaped.

### SVG

Validate finite positive `fontSize` and `lineHeight`, finite non-negative padding, and calculated dimensions no greater than 32,768 pixels per axis. Foreground, background, title, and art remain escaped. Invalid numeric options fail with precise errors instead of producing `NaN`, `Infinity`, negative, or impractically large SVG attributes.

## Stage 3: Browser correctness, responsiveness, and modularity

### Image loading

Each file acceptance increments an image-load revision. Only the newest revision may replace the active image or update status. A successfully decoded stale image is disposed immediately. A stale failure does not overwrite the current status.

Files with an empty MIME type are allowed to reach the decoder; an explicit non-image MIME type remains rejected. Decode success is the final authority for supported browser formats.

Capture one decoded bitmap for conversion and reuse it for every control render. Animated images may still animate in the visual source preview, but generated output always uses the single captured frame and is deterministic for the active image and settings. Documentation describes this behavior explicitly.

### Bounded preparation and worker conversion

Resolve and validate target dimensions before creating a Canvas. Canvas pixel count is also limited to 648,000 pixels, the maximum implied by the browser's 180-column UI limit, 400-row core limit, and 3x oversampling ceiling.

Move pure ASCII conversion into a Vite module worker. The main thread performs bounded Canvas preparation, transfers the prepared pixel buffer with a render revision, and applies only the latest worker result. This makes the existing render revision meaningful and keeps controls responsive while conversion runs. Stale results are ignored; errors are returned as structured messages and displayed through the normal status path.

### Browser modules

Reduce `src/main.ts` to composition and event wiring by extracting focused modules for:

- typed DOM element lookup and control read/write operations;
- image selection and stale-load protection;
- worker-backed rendering and generated-output formatting;
- download and clipboard actions;
- saved-preset list rendering and editing state.

The custom-preset schema and pure persistence helpers remain separate. Shared blob download code replaces the current duplicate implementations.

### Interaction and accessibility behavior

- Ignore global image paste when the event originates from an input, textarea, select, or contenteditable element.
- Keep one authoritative live region for each kind of update; the same preset message is not announced twice.
- Preserve the unsaved-preset `beforeunload` warning already present in the current baseline.
- Use the real file input/button relationship without manually duplicating button semantics.
- Raise faint text contrast to at least the normal-text threshold used by the interface review, allow long source names to wrap, and add a matching dark `theme-color` metadata value.
- Preserve keyboard access, visible focus, reduced-motion behavior, skip navigation, undo for preset deletion, and responsive single-column layout.

## Stage 4: CLI safety and testable orchestration

### CLI architecture

Keep `src/cli.ts` as a thin executable entry point. Move orchestration into an exported `runCli` function whose process streams, filesystem operations, image decoder, and current working directory can be supplied through a runtime interface. Keep argument parsing separate.

### Preflight

Before Sharp resize or output creation:

1. parse and fully validate assembled options, including ramp length;
2. read metadata and resolve bounded output dimensions;
3. compute every target output path;
4. compare resolved input and output identities and reject attempts to overwrite the source image;
5. validate all output targets before writing any file.

No implicit `--force` behavior is added. Protecting the input is the default contract.

### Writes

Write output to temporary files in the destination directory and rename them into place only after content has been produced successfully. For `--format all`, prepare and validate all three target paths before starting writes. Error messages identify the failed input or output and leave the original source untouched.

The CLI keeps existing stdout behavior when no output path is supplied and existing stderr reporting for written files and errors.

## Stage 5: Behavioral tests, documentation, and final quality gate

### Test layers

1. **Core unit tests:** dimension boundaries, complete runtime validation, quantiles, zero-detail fast path, every dithering mode, edge glyphs, long ramps, Markdown language rejection, SVG numeric rejection, and preset lookup/cloning.
2. **Browser unit/DOM tests:** stale image resolution, stale errors, deterministic captured-frame reuse, paste scoping, one live announcement, preset dirty/update/delete/undo flow, output switching, clipboard fallback, and download naming. DOM-facing controllers use `happy-dom` through Vitest, with Canvas and Worker boundaries mocked.
3. **Worker contract tests:** request/revision mapping, successful conversion response, and serialized errors.
4. **CLI integration tests:** help, stdout, each file format, `all`, unknown/invalid options before decode, EXIF-aware sizing, extreme aspect rejection before resize, input/output collision, atomic write failure, and non-zero exit behavior.
5. **Golden examples:** regenerate output in a temporary directory and byte-compare text, Markdown, and SVG with `examples/demo.*`.
6. **Runtime smoke checks:** load the production interface at desktop and mobile widths, verify no horizontal page overflow or console errors, exercise output tabs and preset controls, and confirm the generated preview remains usable.

Add V8 coverage for logic-bearing modules. Thin executable/bootstrap files, generated declarations, and Vite environment declarations may be excluded. Enforce at least 80% line/function/statement coverage and 75% branch coverage for the included modules.

### Documentation

Update README architecture and validation sections, describe saved-preset persistence/import/export, document deterministic single-frame handling for animated images, explain the 400-row safety limit and CLI `--height` remedy, and add complete width/height attributes to README images. Correct the Turkish reference document so browser oversampling and CLI's configurable 1–5 range are described separately.

Do not add `repository`, `homepage`, badges, or deployment links until the actual GitHub `owner/repository` is known.

## Data flow after refactor

### Browser

```text
File/paste/drop
  -> revisioned decode and captured bitmap
  -> bounded output-dimension resolution
  -> bounded Canvas preparation
  -> transferable worker request with render revision
  -> shared core conversion
  -> latest-result filter
  -> text / safe Markdown / validated SVG
  -> preview, clipboard, or browser download
```

### CLI

```text
argv
  -> parse command
  -> shared option validation
  -> metadata and bounded dimensions
  -> output-path/input-collision preflight
  -> Sharp rotate/resize/raw decode
  -> shared core conversion
  -> text / safe Markdown / validated SVG
  -> stdout or temporary-file + rename
```

## Error handling contract

- User-caused validation errors are specific, deterministic, and raised before expensive work.
- Browser stale operations end silently after disposing their resources; they do not replace current state.
- Browser active-operation failures clear generated-output availability and provide a corrective message in one live region.
- Worker errors are serialized without losing the user-facing message.
- CLI errors write one `Error: ...` line to stderr, set a non-zero exit code, and never overwrite the input.
- Storage failures leave the current preset collection unchanged and explain how the user can retry.
- Formatter functions reject structurally unsafe options rather than attempting to sanitize ambiguous input.

## Compatibility and acceptance criteria

The refactor is accepted when all of the following are true:

- Existing demo text, Markdown, and SVG outputs remain byte-identical unless a documented safety fix requires a fixture update.
- No internal registry hostname exists in tracked package metadata.
- A clean public-registry `npm ci` succeeds.
- Derived dimensions are rejected before Canvas or Sharp allocation when either dimension exceeds 400.
- Rapid image selections cannot apply or announce a stale result.
- Re-rendering an accepted animated image with unchanged options produces identical output.
- The CLI refuses to write any output over its input image.
- Markdown language and SVG numeric injection/invalid-value tests pass.
- Browser code cannot access Node ambient globals and CLI code cannot access DOM ambient globals.
- GitHub Pages cannot upload or deploy when required verification fails.
- Lint, format check, type checks, tests, coverage, web build, CLI build, CLI smoke, example comparison, and browser smoke checks all pass.
- README and technical notes describe the implementation and limits accurately.

## Delivery order and change isolation

Implementation follows the five stages in order. Each stage begins with failing tests for the defects it addresses, makes the smallest implementation needed to pass, and runs the full current gate before moving on. Generated `dist` and `dist-cli` artifacts are validation outputs, not source-of-truth code.

Because this directory is not currently a Git checkout, no commit can be created from this specification. Once Git metadata is restored, each stage should be committed independently so review and rollback remain straightforward.

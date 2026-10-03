# AsciiLoom

A local-first image-to-ASCII generator built specifically for GitHub README files.

**Live app:** <https://asciiloom.aliyilmaz.co>

It provides a polished browser interface and a scriptable CLI, both powered by the same strict TypeScript conversion core. The primary output is plain, copy-ready ASCII with no ANSI escape sequences. For stable typography and colors across GitHub themes, it can also export an accessible SVG.

The source checkout contains project-owned/generated preview assets under `examples/`, including the legacy demo and golden outputs for Fine Blocks, Braille, and Structural Unicode. Their provenance and attribution are recorded in [`NOTICE.md`](https://github.com/aliyilmazco/asciiloom/blob/main/NOTICE.md). Release verification regenerates every text, Markdown, and SVG result from source-controlled fixtures. These assets document the browser project but are intentionally excluded from the CLI-only npm package.

## Why this project exists

Most terminal-oriented ASCII packages optimize for ANSI colors, terminal geometry, or console composition. A GitHub README has different constraints:

- ANSI escape codes do not create portable README visuals.
- The output must remain valid GitHub Flavored Markdown even when the character ramp contains backticks or tildes.
- Monospace character cells are taller than they are wide, so naive image resizing distorts the subject.
- Photos need perceptual luminance, local detail recovery, contrast normalization, and controlled dithering to survive heavy downsampling.
- Plain Markdown follows the viewer's GitHub theme; an SVG option is useful when exact foreground/background rendering matters.

AsciiLoom handles those concerns directly rather than adapting a terminal renderer after the fact.

## Highlights

- **Local browser processing:** drag, drop, paste, or browse for an image; the file never leaves the tab.
- **Shared browser and CLI core:** the same conversion logic produces consistent results in both environments.
- **Strict ASCII by default:** the `README balanced` preset and `readme` character style remain the safest cross-platform README choices.
- **Perceptual luminance:** linearized sRGB luminance instead of a simple RGB average.
- **Detail preservation:** oversampling, percentile auto-levels, local-detail enhancement, gamma, contrast, and brightness controls.
- **Four dithering modes:** Atkinson, Floyd–Steinberg, ordered Bayer 4×4, or none.
- **Expanded character styles:** Fine Blocks provides nine ordered Unicode levels, while true Braille packs real 2×4 subcells for compact detail.
- **Connectivity-aware structure:** Structural Unicode follows contours with straight, diagonal, corner, T, and cross glyphs. The independent ASCII edge overlay remains available for strict-ASCII styles.
- **Alpha-safe:** transparent pixels are composited against a configurable background.
- **README-safe Markdown:** the fenced-code delimiter is selected and lengthened automatically so generated punctuation cannot close the block.
- **Three outputs for every style:** plain text, paste-ready Markdown, and accessible SVG can be generated separately or together.
- **Opt-in Unicode:** Unicode styles are never forced and may vary with the viewer's monospace font.
- **No runtime framework:** the web interface is small, static, and deployable to Cloudflare Workers.
- **Strict and tested:** strict TypeScript, deterministic conversion, and unit tests for mapping and output safety.

## Quick start: web interface

No install needed: open <https://asciiloom.aliyilmaz.co>. Images are processed locally in your browser and never uploaded.

To run it from source instead:

Requirements: Node.js 22.12 or a later even-numbered Node.js release.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, then drop an image into the page. Changes are rendered live.

Create a production build with:

```bash
npm run build
npm run preview
```

The static site is written to `dist/`.

### Deploy to Cloudflare Workers

The repository's `wrangler.jsonc` publishes `dist/` as [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/). The configured Worker name is `asciiloom`; it must match the Worker connected to this repository in Cloudflare. Production is served on the custom domain `asciiloom.aliyilmaz.co`, declared in `wrangler.jsonc` under `routes` with `custom_domain: true`; Cloudflare creates the DNS record and certificate on deploy.

Manual production deploy:

```bash
npm run build:web
npx wrangler deploy
```

Use these [Workers Builds settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/):

| Setting                          | Value                          |
| -------------------------------- | ------------------------------ |
| Root directory                   | Repository root                |
| Build command                    | `npm run build:web`            |
| Deploy command (production)      | `npx wrangler deploy`          |
| Preview deploy command           | `npx wrangler versions upload` |
| `BASE_PATH` environment variable | `/`, or leave unset            |

`wrangler versions upload` uploads a version without promoting it to production. Use `wrangler deploy` for the production deploy command. Keep `BASE_PATH` at `/` for Workers.

To check the configuration locally without publishing:

```bash
npm run build:web
npx wrangler@4.129.0 deploy --dry-run
```

To serve the build locally through Wrangler, run `npx wrangler@4.129.0 dev --local` and open the URL it prints.

## Quick start: CLI

The public npm package and installed executable are both named `asciiloom`. The npm package distributes only the CLI; the browser studio remains available from this source repository and is not included in the package's runtime contents.

Install the CLI globally:

```bash
npm install --global asciiloom
asciiloom ./photo.jpg --preset readme --output ./ascii-photo.md
```

Run it without a permanent global installation:

```bash
npm exec --yes --package asciiloom -- \
  asciiloom ./photo.jpg --preset readme --output ./ascii-photo.md
```

For development, run directly from a source checkout:

```bash
npm run cli -- ./photo.jpg --preset portrait --output ./ascii-photo.md
```

You can also compile the CLI locally and invoke its executable module:

```bash
npm run build:cli
node ./dist-cli/cli.js ./photo.jpg --preset portrait --output ./ascii-photo.md
```

Generate text, Markdown, and SVG together:

```bash
asciiloom ./logo.png \
  --preset logo \
  --format all \
  --output ./docs/logo-ascii
```

This writes:

```text
docs/logo-ascii.txt
docs/logo-ascii.md
docs/logo-ascii.svg
```

Print every CLI option, or the installed version, with:

```bash
asciiloom --help
asciiloom --version
```

Use `--format text`, `--format markdown`, or `--format svg` for one output type, or `--format all` to generate all three.

### Useful CLI examples

Character-style overlays can be combined with any preset:

```bash
asciiloom photo.jpg --preset portrait --style blocks-fine --output photo.md
asciiloom photo.jpg --preset portrait --style braille --output photo.md
asciiloom logo.png --preset logo --style structure --format all --output docs/logo
```

CLI options are assembled in this order: preset defaults, then `--style`, then explicit flags. Braille rejects an explicit `--ramp` or `--edge-glyphs` because those options describe incompatible cell models. Structural Unicode accepts `--ramp`; the custom ramp becomes its tonal fallback where no structural stroke is emitted.

Detailed portrait:

```bash
asciiloom portrait.webp \
  --preset portrait \
  --width 104 \
  --dither atkinson \
  --detail 0.9 \
  --output portrait.md
```

High-contrast logo with structural edge glyphs:

```bash
asciiloom mark.png \
  --preset logo \
  --edge-glyphs \
  --background '#ffffff' \
  --output mark.md
```

Stable SVG for a README:

```bash
asciiloom hero.jpg \
  --preset ultra \
  --format svg \
  --output docs/hero-ascii.svg
```

Embed the result:

```markdown
![ASCII rendering of the hero image](./docs/hero-ascii.svg)
```

## Presets

| Preset     | Default width | Best for                     | Main behavior                                            |
| ---------- | ------------: | ---------------------------- | -------------------------------------------------------- |
| `readme`   |            88 | General README artwork       | Portable ASCII ramp, Atkinson dithering, balanced detail |
| `portrait` |            96 | Faces and textured photos    | Long density ramp and stronger local detail              |
| `logo`     |            76 | Icons, logos, line drawings  | Short ramp, high contrast, ASCII edge overlay            |
| `ultra`    |           120 | Wide desktop layouts and SVG | Long ramp, stronger detail, Floyd–Steinberg dithering    |
| `unicode`  |            92 | Compact high-contrast output | Block glyphs; visually strong but not strict ASCII       |

A preset is only a starting point. Width, character aspect ratio, ramp, dither mode, tone controls, detail, background, inversion, and edge behavior can all be overridden.

### Saved browser presets

The web interface can save the current conversion controls and Markdown-details preference in browser-local storage. Saved presets never include the source image or generated output.

- **Apply** restores a preset's controls.
- **Update Preset** writes changed controls back to the applied preset.
- **Export Selected** downloads one versioned JSON preset.
- **Import JSON** accepts one preset or an array of compatible presets.
- Name collisions receive a numeric suffix instead of replacing an existing preset.
- Delete offers an eight-second undo window.
- A browser profile can store at most 100 presets, and imported JSON files are limited to 1 MiB.

Preset data stays in the current browser profile unless you explicitly export the JSON file.

Exported presets use schema v2. Stored or imported schema v1 presets are migrated in memory with `renderMode: tone` and `edgeStyle: ascii`; simply loading or applying one does not rewrite browser storage. Browser presets use the `asciiloom.custom-presets.v1` storage namespace. The next successful preset mutation persists all entries as v2. Unknown future schema versions are rejected before any preset, selection, controls, or stored bytes can change.

## Output choices

### 1. Plain ASCII

Use this for text files, terminals, issue comments, or your own Markdown wrapper.

### 2. Paste-ready Markdown

The generator emits a fenced `text` code block. It scans the artwork for consecutive backticks and tildes, chooses the shorter safe delimiter, and makes that fence longer than every matching run in the image.

For very large artwork, enable the collapsible option to generate:

```html
<details open>
  <summary>my-image</summary>

  <!-- safe fenced ASCII block -->
</details>
```

Leading spaces and logical blank rows are preserved. Trailing spaces on each row are removed by default because they add invisible noise to diffs and are unnecessary for right-side padding.

### 3. SVG

SVG keeps a fixed background, foreground color, line spacing, and monospace font stack. The output contains an accessible `<title>`, preserves spaces and logical blank rows, and uses conservative terminal-cell widths for combining marks, CJK, and emoji so wide glyphs are not clipped.

Use SVG when theme-independent rendering matters. Use direct Markdown when copyable text and native GitHub code-block styling matter more.

## Conversion pipeline

The renderer intentionally separates image preparation from glyph mapping so the pure conversion core is easy to test.

1. **Decode and orient:** the browser preflights PNG, JPEG, WebP, and GIF dimensions, decodes an `Image`, captures one stable `ImageBitmap` frame, and prepares it with Canvas; the CLI uses Sharp and applies EXIF orientation.
2. **Correct geometry:** row count is calculated from the source aspect ratio and a configurable character-cell ratio, `0.5` by default.
3. **Oversample:** the source is resized above the final character grid to reduce aliasing before cell averaging.
4. **Composite alpha:** RGBA pixels are blended against the selected background.
5. **Convert to luminance:** sRGB channels are linearized, then combined using perceptual luminance weights.
6. **Average into cells:** tone styles average linear luminance into character cells (Braille preserves a real 2×4 subcell grid), then convert each cell to perceptual lightness (CIE L\*) so ramp levels are spent evenly on visible tones instead of crowding midtones into dark glyphs.
7. **Normalize:** optional low/high percentile auto-levels reduce the impact of isolated extreme pixels.
8. **Recover local detail:** a 3×3 Gaussian blur creates a local reference; high-frequency information is blended back as an unsharp-detail term.
9. **Apply tone controls:** contrast, brightness, gamma, and optional inversion.
10. **Analyze edges:** optional Sobel gradients estimate contour magnitude and orientation; Structural Unicode also derives compatible neighboring stroke connections.
11. **Render glyphs:** tone values map through a ramp, Braille packs eight binary subcells, Shape match compares each cell's 3×4 darkness layout with measured ASCII glyph ink layouts and picks the closest glyph, and Structural Unicode chooses connected straight, diagonal, corner, T, or cross strokes with a tonal fallback. Dithering remains deterministic (Shape match does not dither).
12. **Format safely:** text is emitted directly, wrapped in a collision-safe Markdown fence, or encoded as SVG.

## Character styles

The browser and `--style` CLI option expose seventeen stable styles. Strict ASCII remains the default; Unicode styles are opt-in and their exact appearance depends on the viewer's font. For output that looks most like the source image, use `shape`.

| ID             | Portability  | Renderer model                        | Intended use                                     |
| -------------- | ------------ | ------------------------------------- | ------------------------------------------------ |
| `readme`       | Strict ASCII | 10-level tone ramp                    | Portable general-purpose README artwork          |
| `shape`        | Strict ASCII | 3×4 glyph-shape matching per cell     | Closest likeness: outlines, diagonals, curves    |
| `detailed`     | Strict ASCII | Long tone ramp                        | Faces, textures, and smooth tonal transitions    |
| `soft`         | Strict ASCII | Gentle tone ramp                      | Light gradients and restrained texture           |
| `minimal`      | Strict ASCII | Short tone ramp                       | Bold silhouettes, icons, and line drawings       |
| `calibrated`   | Strict ASCII | 14 measured, font-stable levels       | Most faithful tones across GitHub fonts          |
| `alphanumeric` | Strict ASCII | 10 letter-only levels                 | Clean text-like texture without punctuation      |
| `classic`      | Strict ASCII | Paul Bourke's famous 10-level ramp    | The recognizable "standard" ASCII-art look       |
| `jp2a`         | Strict ASCII | jp2a terminal converter character set | Terminal-style photos with letter texture        |
| `bubbles`      | Strict ASCII | Round `@Oo:.` levels                  | Soft, dotted, playful rendering                  |
| `matrix`       | Strict ASCII | Binary `0` / `1` digits               | "Hacker" / Matrix-style banners                  |
| `silhouette`   | Strict ASCII | Two-level `#` stencil                 | Logos and bold shapes, like classic banners      |
| `blocks`       | Unicode      | Five block-shade levels               | Compact, high-contrast tonal output              |
| `blocks-fine`  | Unicode      | Nine ordered fractional block levels  | Smoother block gradients                         |
| `bars`         | Unicode      | Nine lower-block height levels        | Bar-chart texture with smooth vertical steps     |
| `braille`      | Unicode      | Real 2×4 binary subcells              | Dense detail in a compact character grid         |
| `structure`    | Unicode      | Connectivity-aware contour strokes    | Diagrams, logos, corners, junctions, and crosses |

### Advanced tone ramps

Tone ramps are ordered from darkest/densest to lightest/sparsest. The `calibrated` and `alphanumeric` ramps were derived from measured glyph ink coverage and get strictly lighter at every step in Menlo, SF Mono, and Courier New. `classic`, `jp2a`, `bubbles`, `matrix`, and `silhouette` are popular community sets kept verbatim for their familiar look. The CLI accepts these fourteen named ramps independently of `--style`:

```text
readme        @#%*=+:-.
detailed      @$B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\|()1{}[]?-_+<>i!lI;:,"^'.
soft          MWN$@#%*=+:-,.
minimal       #*=+:-.
calibrated    BRDPeync>+!:.
alphanumeric  BRDPeynvl
blocks        █▓▒░
blocks-fine   █▉▊▋▌▍▎▏
bars          █▇▆▅▄▃▂▁
classic       @%#*+=-:.
jp2a          MWNXK0Okxdolc:;,'.
bubbles       @Oo:.
matrix        01
silhouette    #
```

The CLI accepts either a built-in name or a custom string:

```bash
asciiloom image.png --ramp '@#*:. ' --output custom.md
```

Use at least two characters. A final space gives bright pixels a true blank value. Custom ramps belong to tone rendering and Structural Unicode fallback rendering; Braille packing does not use a ramp.

## Architecture

```text
src/
├── browser/
│   ├── ascii.worker.ts    Off-main-thread conversion worker
│   ├── image.ts           Size-limited decoding and bounded bitmap/Canvas preparation
│   ├── image-selection.ts Latest-selection-wins image lifecycle
│   ├── render-client.ts   Coalesced latest-revision worker client
│   ├── render-lifecycle.ts Decode/render/teardown race coordinator
│   ├── render-worker.ts   Pure worker conversion and error serialization
│   ├── app.ts             Image, worker, and page lifecycle orchestration
│   ├── controls.ts        Typed conversion-control adapter
│   ├── copied-feedback.ts Cancelable clipboard button feedback
│   ├── dropdown.ts        Accessible keyboard and pointer dropdown controller
│   ├── custom-presets.ts  Versioned preset parsing and persistence
│   ├── preset-controller.ts Saved-preset state and undo lifecycle
│   ├── preset-workflow.ts Saved-preset DOM workflow and async teardown
│   ├── preset-list-view.ts Saved-preset list rendering
│   ├── output-controller.ts Format, fast Markdown refresh, copy, download, and UI state
│   └── output.ts          Copy, download, Markdown, and SVG helpers
├── cli.ts                 Thin Node/Sharp executable entry point
├── cli-options.ts         Strict argument parsing and option assembly
├── cli/
│   ├── files.ts           Collision checks and atomic output writes
│   └── run.ts             Injectable CLI orchestration
├── core/
│   ├── ascii.ts           Pure image-to-ASCII conversion pipeline
│   ├── braille.ts         Pure Unicode Braille 2×4 subcell packer
│   ├── character-styles.ts Shared style registry and option resolution
│   ├── markdown.ts        GFM-safe fenced blocks and optional <details>
│   ├── presets.ts         Ramps, defaults, and presets
│   ├── structure.ts       Connectivity-aware Unicode contour renderer
│   ├── svg.ts             Accessible, theme-stable SVG renderer
│   ├── types.ts           Shared public types
│   └── validation.ts      Shared option and output-dimension limits
├── main.ts                Thin browser dependency composition
└── style.css              Responsive interface styling
```

The conversion core has no DOM, Canvas, Node, or Sharp dependency. It accepts raw RGB/RGBA pixel data, which keeps browser/CLI behavior aligned and makes unit tests fast. Browser conversion runs in a module worker; the CLI validates every destination before decoding pixels and commits each generated file with an atomic sibling-file rename. When an existing POSIX output is replaced, its permission bits are preserved.

## Validation

Run the complete local verification:

```bash
npm run check
npm run test:e2e
npm run release:check
```

`npm run check` verifies the lockfile registry, runs strict TypeScript checks for browser, CLI, tests, and tooling, enforces Oxlint and Prettier, and runs the non-emitting unit/browser/CLI-runtime suite.

`npm run test:e2e` builds the production web app, installs the Playwright-managed Chromium build when it is missing, and smoke-tests that built app through `vite preview`. It verifies the strict-ASCII default, the logo/edge preset, real file upload, Fine Blocks, Braille, Structural Unicode, ASCII/Markdown/SVG output, exact clipboard/download contents, saved-preset v2 reload, a clean browser console, and 390-pixel mobile layout. The same test honors `BASE_PATH` for deployments under a subpath.

`npm run release:check` adds a high-severity dependency audit, enforced global and browser-controller per-file coverage thresholds, production web and CLI builds, the complete Chromium workflow, compiled-CLI subprocess tests, and byte-for-byte regeneration of both legacy and new character-style goldens. It also creates the real npm tarball, derives and verifies the dynamic CLI-only JavaScript allowlist, installs that tarball into an empty consumer project, runs the packaged `asciiloom --help`, and confirms that the installed CLI reproduces every committed text, Markdown, and SVG example byte for byte. Pull-request CI installs Chromium's Linux system dependencies and runs this complete gate in addition to Node 22/24/26 checks, while macOS and Windows jobs exercise the compiled CLI safety suite. `npm run verify:examples` and `npm run verify:package` can also be run independently; the former rebuilds the CLI before comparing local outputs, while the latter expects `dist-cli` to have already been built.

`npm pack --dry-run --foreground-scripts` and `npm publish --dry-run --foreground-scripts` may be used as final package simulations. A publish dry run is verification only: it does not create a live npm release. Real publication remains a separate, explicitly authorized action.

Tests cover:

- character-cell aspect correction;
- derived-height and runtime-option limits before large allocations;
- sRGB relative luminance behavior;
- dark/light glyph ordering;
- transparent-pixel compositing;
- requested output width;
- deterministic error diffusion;
- Fine Blocks ordering, true Braille dot mapping, and connectivity-aware Structural Unicode glyph selection;
- backtick and tilde fence collisions;
- logical trailing blank-row preservation;
- HTML escaping in collapsible summaries;
- SVG escaping, metrics, and accessibility metadata;
- source-file/pixel limits, bounded bitmap capture, latest-selection-wins decoding, and coalesced worker responses;
- keyboard, pointer, typeahead, and dismissal behavior for custom dropdowns;
- saved-preset v1-to-v2 migration, renderer dirty state, atomic future-version rejection, persistence, deletion, and undo;
- preset/output controller teardown, output-only Markdown refresh, late async completion, copy, download, and error states;
- initial, stale, failed, and image-replacement browser render orchestration;
- production Chromium conversion for strict ASCII and all new Unicode styles, preset reload, byte-exact clipboard/download output, console, and mobile-overflow behavior;
- stable range-control accessible names and current values;
- input/output path, symlink, and hard-link collision prevention;
- permission-preserving atomic CLI writes and compiled output compatibility.

## Continuous integration

`.github/workflows/ci.yml` checks Node 22/24/26, including the compiled CLI on every supported major, the Chromium-backed complete release gate, and compiled CLI behavior on macOS and Windows for pushes and pull requests.

Workflow actions are pinned to reviewed immutable commits; `.github/dependabot.yml` checks weekly for action updates.

The web interface is deployed through Cloudflare Workers using the [settings above](#deploy-to-cloudflare-workers).

## Practical limits

- Very wide code blocks can scroll horizontally on mobile. Start near 70–96 columns for a general README.
- Exact code-block colors depend on the viewer's GitHub theme. Export SVG for fixed colors.
- ASCII cannot preserve full color or every photographic detail; composition, contrast, and a suitable crop still matter.
- The browser accepts formats its image decoder supports. The CLI's supported formats come from the installed Sharp build.
- Gamma correction accepts `0.1–10`; the browser controls intentionally expose the narrower `0.45–2.2` range for practical tuning.
- Browser source files are limited to 32 MiB and 40 megapixels. Known PNG, JPEG, WebP, and GIF dimensions are checked before browser decode, the decoded dimensions are checked again as a fallback, and accepted large images are downsampled to a bounded working bitmap before repeated renders.
- Animated browser images are sampled once when accepted, so repeated renders with unchanged settings stay deterministic.
- Output height is limited to 400 rows. For an extreme portrait image, crop the source or pass a smaller explicit CLI `--height` value.
- Browser-local preset storage is limited to 100 entries; imported preset JSON must be 1 MiB or smaller.
- Unicode block, Braille, and structural glyph widths and shapes depend on the selected monospace font and rendering platform. Strict ASCII is the safest choice for cross-platform README fidelity.

## Open-source project

- Read [`CONTRIBUTING.md`](https://github.com/aliyilmazco/asciiloom/blob/main/CONTRIBUTING.md) before opening a pull request.
- Report security issues through the process in [`SECURITY.md`](https://github.com/aliyilmazco/asciiloom/blob/main/SECURITY.md); do not disclose suspected vulnerabilities in public issues.
- Participation expectations are documented in [`CODE_OF_CONDUCT.md`](https://github.com/aliyilmazco/asciiloom/blob/main/CODE_OF_CONDUCT.md).
- Release history is recorded in [`CHANGELOG.md`](https://github.com/aliyilmazco/asciiloom/blob/main/CHANGELOG.md).

The npm package is intentionally CLI-only; the browser studio and repository documentation remain available from the source repository.

## License

MIT. See [`LICENSE`](./LICENSE).

# Character Style Renderers Design

**Status:** Approved in conversation on 2026-07-16

**Goal:** Extend README ASCII Studio with fine Unicode block shading, true Braille subcell rendering, and connectivity-aware Unicode structural rendering while preserving the existing strict-ASCII default and every current preset output.

## Product decisions

- `README balanced` remains the default preset and strict ASCII remains the safest default output.
- All current character ramps stay available:
  - `readme`
  - `detailed`
  - `soft`
  - `minimal`
  - `blocks`
- Three opt-in character styles are added:
  - `blocks-fine`
  - `braille`
  - `structure`
- Fine Blocks uses the existing tone and dithering pipeline.
- Braille uses a true 2×4 subcell renderer; it is not treated as a linear character ramp.
- Structural Unicode uses contour direction and neighboring connectivity; it is not implemented as a simple character substitution.
- The browser exposes one `Character style` selector instead of adding separate renderer controls.
- The CLI adds `--style <name>` while keeping `--preset`, `--ramp`, and `--edge-glyphs` backward compatible.
- Unicode styles never silently fall back to ASCII because a fallback would change requested output without the user knowing.
- No runtime dependency is added.
- No real npm publish is part of this work.

## Research basis

- Unicode classifies ASCII as East Asian Narrow while some non-ASCII characters have context-dependent width. This supports keeping strict ASCII as the portable README default: [Unicode Standard Annex #11 — East Asian Width](https://www.unicode.org/reports/tr11/).
- Unicode Block Elements are defined as graphic compatibility characters that fill a specified fraction of a display cell or provide a specified degree of shading: [Unicode 17, Chapter 22](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-22/) and [Block Elements chart](https://www.unicode.org/charts/nameslist/n_2580.html).
- Braille Patterns provide a standardized 2×4 dot arrangement across `U+2800–U+28FF`: [Unicode Braille Patterns chart](https://unicode.org/charts/PDF/U2800.pdf).
- Tone-based ASCII art and structure-based ASCII art solve different visual problems. Structural output should match important contours with glyph shape rather than brightness alone: [Xu, Zhang, and Wong, “Structure-based ASCII Art”](https://ttwong12.github.io/papers/asciiart/asciiart.html).
- GitHub Flavored Markdown treats fenced-code contents as literal text, so the new Unicode output remains safe inside the project's existing dynamically sized fences: [GFM fenced code blocks](https://github.github.com/gfm/#fenced-code-blocks).

## Current behavior that must remain stable

The existing converter maps processed luminance to an ordered ramp and optionally overlays ASCII `-`, `|`, `/`, and `\` glyphs using Sobel magnitude and angle. The current browser and CLI share this core.

The following existing preset identifiers and their generated outputs must remain unchanged:

- `readme`
- `portrait`
- `logo`
- `ultra`
- `unicode`

The committed `examples/demo.txt`, `examples/demo.md`, and `examples/demo.svg` files remain byte-identical. Existing CLI commands, error codes, `--ramp` custom strings, Markdown fencing, SVG accessibility metadata, width limits, image limits, and trailing-space behavior also remain compatible.

## Scope

### Included

- Shared character-style registry for browser and CLI.
- Fine Block tone style using `█▉▊▋▌▍▎▏ ` from darkest to lightest.
- Braille renderer using the standard 2×4 dot mapping.
- Structural Unicode renderer supporting:
  - `─`
  - `│`
  - `╱`
  - `╲`
  - `┌`
  - `┐`
  - `└`
  - `┘`
  - `├`
  - `┤`
  - `┬`
  - `┴`
  - `┼`
- Browser style selection and saved-preset persistence.
- CLI style selection and conflict validation.
- Plain text, Markdown, and SVG output for every new style.
- Deterministic fixtures, golden files, browser E2E, packaged-CLI smoke tests, documentation, and dry-run release verification.

### Excluded

- ANSI color output.
- Animated ASCII art.
- User-defined Braille bit layouts or structural glyph kits.
- Dynamic font calibration or browser-specific glyph-density sorting.
- Proportional-font output.
- Full AISS or optimization-based reproduction of the SIGGRAPH paper.
- Changes to image upload limits, output size limits, color output, or the public npm package's CLI-only positioning.
- Real npm publication, Git commits, tags, pushes, or releases.

## Core option model

Two fields are added to `AsciiOptions`:

```ts
export type RenderMode = 'tone' | 'braille';
export type EdgeStyle = 'ascii' | 'unicode';

export interface AsciiOptions {
  // Existing fields stay unchanged.
  renderMode: RenderMode;
  edgeStyle: EdgeStyle;
}
```

Defaults are:

```ts
renderMode: 'tone';
edgeStyle: 'ascii';
```

This shape deliberately preserves the existing `edgeGlyphs` boolean:

- `renderMode: 'tone'`, `edgeGlyphs: false` — normal ramp renderer.
- `renderMode: 'tone'`, `edgeGlyphs: true`, `edgeStyle: 'ascii'` — existing byte-compatible ASCII edge overlay.
- `renderMode: 'tone'`, `edgeGlyphs: true`, `edgeStyle: 'unicode'` — new connectivity-aware Structural Unicode renderer.
- `renderMode: 'braille'`, `edgeGlyphs: false` — true Braille subcell renderer.

`renderMode: 'braille'` combined with `edgeGlyphs: true` is invalid because the edge overlay and Braille subcell grid describe incompatible cell models.

The existing `ramp` field remains required. It is ignored by the Braille core renderer but retained so the option object stays compatible with the existing browser controls, presets, and conversion result contracts. The CLI rejects an explicitly supplied `--ramp` with `--style braille` instead of pretending that the ramp affects Braille output.

## Character-style registry

A shared `src/core/character-styles.ts` module defines style metadata and option overlays:

```ts
export type CharacterStyleId =
  'readme' | 'detailed' | 'soft' | 'minimal' | 'blocks' | 'blocks-fine' | 'braille' | 'structure';

export interface CharacterStyle {
  id: CharacterStyleId;
  label: string;
  description: string;
  portability: 'strict-ascii' | 'unicode';
  options: Pick<AsciiOptions, 'ramp' | 'renderMode' | 'edgeGlyphs' | 'edgeStyle'>;
}
```

Style overlays are:

| Style         | Ramp                  | Render mode | Edge glyphs | Edge style |
| ------------- | --------------------- | ----------- | ----------- | ---------- |
| `readme`      | existing readme ramp  | `tone`      | `false`     | `ascii`    |
| `detailed`    | existing detailed     | `tone`      | `false`     | `ascii`    |
| `soft`        | existing soft ramp    | `tone`      | `false`     | `ascii`    |
| `minimal`     | existing minimal      | `tone`      | `false`     | `ascii`    |
| `blocks`      | existing block shades | `tone`      | `false`     | `ascii`    |
| `blocks-fine` | `█▉▊▋▌▍▎▏ `           | `tone`      | `false`     | `ascii`    |
| `braille`     | existing readme ramp  | `braille`   | `false`     | `ascii`    |
| `structure`   | existing minimal ramp | `tone`      | `true`      | `unicode`  |

Styles affect glyph generation only. They do not change width, cell aspect ratio, tone controls, background, detail, or dithering. This lets a user combine, for example, the Portrait preset's geometry and tone settings with the Braille style.

## Component boundaries

### `src/core/character-styles.ts`

- Owns the style identifiers, labels, descriptions, portability labels, and option overlays.
- Resolves a style by identifier.
- Applies a style overlay without mutating its input.
- Resolves the effective built-in style with renderer-aware precedence instead of requiring an exact four-field match.

### `src/core/braille.ts`

- Receives a two-level subcell index field whose dimensions are exactly `outputWidth × 2` by `outputHeight × 4`.
- Packs every 2×4 block into one Unicode Braille code point.
- Emits ASCII space for an empty Braille cell.
- Applies existing trailing-space trimming to the final text rows.
- Contains no image decoding, Canvas, Sharp, DOM, CLI, Markdown, or SVG logic.

### `src/core/structure.ts`

- Receives processed text-cell luminance plus an edge magnitude/angle field.
- Classifies strong edges into horizontal, vertical, rising diagonal, or falling diagonal directions.
- Builds cardinal neighbor connectivity for horizontal and vertical cells.
- Maps the connectivity mask to straight, corner, T-junction, or cross glyphs.
- Uses `╱` and `╲` only for dominant diagonal cells; diagonals do not create box-drawing junctions.
- Falls back to the tone-ramp character when the cell does not contain a sufficiently strong, coherent structure.

### `src/core/ascii.ts`

- Keeps source validation, alpha compositing, perceptual luminance, auto-levels, local detail, tone controls, and existing dithering.
- Calculates text-cell output dimensions exactly as before.
- Dispatches to tone, Braille, or Unicode structural rendering based on the option combination.
- Preserves the existing ASCII edge path without changing its thresholds or glyph mapping.

## Shared data flow

1. Validate the image and complete `AsciiOptions` object.
2. Resolve text-cell output dimensions using the existing width, requested height, and cell-aspect behavior.
3. Composite alpha against the selected background.
4. Compute linearized sRGB relative luminance.
5. Apply auto-levels, local detail, contrast, brightness, gamma, and inversion.
6. Dispatch:
   - Tone style: quantize the text-cell field through the selected ramp and dither mode.
   - Braille style: build and process a 2×4 subcell field for every output cell, quantize it to two levels, then pack the dots.
   - Structural Unicode style: quantize the text-cell tone field, compute coherent structure, and overlay Unicode structure glyphs.
7. Return the existing `ConversionResult` shape.
8. Send the resulting art to the unchanged plain-text, Markdown, and SVG output helpers.

## Fine Blocks algorithm

Fine Blocks uses the existing tone path with this ordered ramp:

```text
█▉▊▋▌▍▎▏
```

The first character represents the darkest quantization level and ASCII space represents the lightest. `none`, Atkinson, Floyd–Steinberg, and Bayer remain available and deterministic. No runtime font measurement reorders the ramp.

## Braille algorithm

The requested `width` and calculated or requested `height` continue to mean output text columns and rows. The Braille renderer internally samples:

```text
subcellWidth  = outputWidth × 2
subcellHeight = outputHeight × 4
```

The shared tone pipeline is applied at subcell resolution. The selected dither mode quantizes the subcell field to two levels. A dark subcell sets a Braille dot; a light subcell clears it.

Dot-to-bit mapping follows Unicode Braille numbering:

```text
1 4   -> bits 0 and 3
2 5   -> bits 1 and 4
3 6   -> bits 2 and 5
7 8   -> bits 6 and 7
```

The result is:

```ts
String.fromCodePoint(0x2800 + bitMask);
```

When `bitMask === 0`, the renderer emits ASCII space rather than `U+2800 BRAILLE PATTERN BLANK`. This preserves normal whitespace semantics, trailing-space trimming, Markdown behavior, and copy/paste predictability.

`ConversionResult.values` remains a `width × height` text-cell field. For Braille it contains the average processed luminance of each cell's eight subcells, preserving the existing result shape and length.

## Structural Unicode algorithm

The existing Sobel calculation provides magnitude and normal angle. The new structural renderer derives the edge tangent and assigns one of four direction classes:

- Horizontal
- Vertical
- Rising diagonal
- Falling diagonal

A cell participates only when magnitude meets `edgeThreshold` and the existing midtone-or-strong-edge guard. This preserves the project's protection against losing hard black/white boundaries.

For horizontal and vertical cells, the renderer checks the north, east, south, and west neighbors. A connection is added only when the neighbor is also strong and directionally compatible. The resulting mask maps as follows:

| Connections      | Glyph |
| ---------------- | ----- |
| east/west        | `─`   |
| north/south      | `│`   |
| south/east       | `┌`   |
| south/west       | `┐`   |
| north/east       | `└`   |
| north/west       | `┘`   |
| north/south/east | `├`   |
| north/south/west | `┤`   |
| east/west/south  | `┬`   |
| east/west/north  | `┴`   |
| all four         | `┼`   |

A one-sided endpoint uses `─` or `│` based on its direction class. Dominant diagonal cells use `╱` or `╲` and do not form box-drawing junctions. If no coherent structural glyph is available, the already selected tone-ramp glyph remains in place.

The current `edgeStyle: 'ascii'` path continues to use only `-`, `|`, `/`, and `\` with the current angle thresholds, so existing Logo output remains byte-identical.

## Browser contract

The current ramp dropdown becomes a `Character style` dropdown containing:

```text
README safe
Detailed ASCII
Soft ASCII
Minimal ASCII
Unicode shades
Fine blocks
Braille subcells
Structural Unicode
```

Each entry displays its glyph preview where meaningful and one portability description:

- `Strict ASCII · portable punctuation`
- `Unicode · font-dependent block shading`
- `Unicode · compact 2×4 subcells`
- `Unicode · structure-optimized strokes`

Selecting a style applies only its four glyph-related defaults. Existing width, aspect, dither, tone, background, and Markdown-details settings remain untouched. Applying a saved preset may then restore its independently stored ASCII edge-glyph toggle; for example, the existing Logo preset is displayed as `Minimal ASCII` with ASCII edge glyphs enabled.

The existing edge-glyph checkbox remains visible and orthogonal to normal tone-ramp styles. Enabling ASCII edge glyphs does not turn `README safe`, `Detailed ASCII`, `Soft ASCII`, `Minimal ASCII`, `Unicode shades`, or `Fine blocks` into a custom style.

The control adapter resolves the effective style in this order:

1. `braille` when `renderMode` is `braille`.
2. `structure` when tone mode has `edgeGlyphs: true` and `edgeStyle: 'unicode'`.
3. A normal tone style by its registered ramp, regardless of whether the independent ASCII edge overlay is enabled.
4. The existing custom/modified state for an unknown glyph-related combination.

Disabling Structural Unicode returns the selector to the tone style identified by its fallback ramp. This priority also lets Structural Unicode use a custom fallback ramp without losing its selected-style label.

## CLI contract

New option:

```text
--style <name>  readme | detailed | soft | minimal | blocks | blocks-fine | braille | structure
```

Examples:

```bash
readme-ascii photo.jpg --preset portrait --style blocks-fine --output photo.md
readme-ascii photo.jpg --preset portrait --style braille --output photo.md
readme-ascii logo.png --preset logo --style structure --format all --output docs/logo
```

Resolution order is:

1. Start from `--preset`, defaulting to `readme`.
2. Apply `--style` when supplied.
3. Apply explicit numeric, tone, background, dither, inversion, edge, height, oversample, output, and format options.
4. Validate the complete command and option combination.

Compatibility rules:

- Existing commands without `--style` retain the same effective behavior and produce byte-identical output.
- Existing named and custom `--ramp` behavior stays available.
- `--style braille --ramp ...` fails because Braille does not consume a ramp.
- `--style braille --edge-glyphs` fails because the two renderers use incompatible cell models.
- `--style structure --ramp ...` is allowed; the custom ramp becomes the tonal fallback behind Unicode structure glyphs.
- An unknown style lists all supported style identifiers.
- Invalid combinations use the existing CLI usage-error path and exit code.

## Saved-preset schema migration

The saved-preset document schema moves from version 1 to version 2. Version 2 adds `renderMode` and `edgeStyle` to the exact `settings.options` shape.

Version 1 input migrates as:

```ts
renderMode: 'tone';
edgeStyle: 'ascii';
```

Rules:

- The existing localStorage key remains stable so old browser data is not orphaned.
- Stored version 1 records are migrated in memory during load.
- The next successful mutation rewrites the collection as version 2.
- Export always produces version 2.
- Import accepts version 1 or version 2, including arrays containing either version.
- Existing name normalization, collision suffixes, 100-preset limit, 1 MiB import limit, selected-only export, deletion, undo, cross-tab reread, dirty-state detection, and beforeunload behavior remain unchanged.
- Unknown future schema versions and unsupported option shapes fail with an actionable preset error; they are never partially imported.

## Validation and errors

Core validation adds:

- `renderMode` must be `tone` or `braille`.
- `edgeStyle` must be `ascii` or `unicode`.
- Braille mode cannot enable edge glyphs.
- Existing ramp, numeric, color, dither, width, height, and control-character validation remains intact.

Browser behavior:

- Invalid stored/imported styles show a preset error without changing current controls.
- A failed render keeps the existing output lifecycle guarantees and displays the error through the current status/output path.
- Unicode font support is described in the style UI but cannot be guaranteed for a future README viewer; the browser does not silently replace requested glyphs.

CLI behavior:

- Unknown style and conflicting flags produce explicit usage errors.
- No destination file is written after a validation failure.
- `--format all` retains atomic destination validation and write behavior.

Custom CLI ramps remain user-controlled. The project validates their scalar/control-character safety as it does today but does not promise that arbitrary Unicode graphemes occupy one cell in every external viewer.

## Output behavior

- Plain text appends the existing final newline.
- Markdown continues to choose a collision-safe backtick or tilde fence and may use the existing details wrapper.
- SVG continues to escape title/content, expose `role="img"`, and use the existing accessibility metadata.
- Each new built-in glyph is one Unicode scalar, so current code-point width accounting remains deterministic.
- Source maps and declaration files may be built locally but remain excluded from the npm tarball.

## Test design

### Character-style registry

- Every identifier resolves to a complete immutable overlay.
- Existing five ramp styles resolve to their current strings.
- Style application does not mutate the source options.
- Braille mode resolves to `braille`; Unicode structural edges resolve to `structure` before ramp matching.
- Normal tone styles resolve by ramp even when the independent ASCII edge overlay is enabled, preserving the existing Logo preset's `Minimal ASCII` identity.
- Unknown glyph-related combinations resolve to the custom state.

### Fine Blocks

- Black maps to `█` and white maps to ASCII space.
- Intermediate values map through all eight fractional block levels in order.
- `none`, Atkinson, Floyd–Steinberg, and Bayer outputs are deterministic.
- Inversion, background compositing, auto-levels, and trailing-space trimming work.

### Braille

- All eight dot positions independently set the correct Unicode bit.
- Empty cells emit ASCII space.
- Full cells emit `⣿` (`U+28FF`).
- Every non-whitespace output scalar is in `U+2801–U+28FF`.
- Requested text width and height are preserved.
- Alpha compositing, inversion, tone controls, and all dither modes are deterministic.
- `ConversionResult.values.length === outputWidth × outputHeight`.
- Braille plus edge glyphs is rejected.

### Structural Unicode

- Horizontal, vertical, rising-diagonal, and falling-diagonal fields select the correct glyphs.
- All four corners, four T-junctions, and the cross are covered.
- One-sided endpoints use the direction's straight glyph.
- Weak, noisy, or incoherent edges retain the tone glyph.
- Hard black/white boundaries still receive structural glyphs when strong.
- Existing ASCII edge golden tests remain unchanged.

### CLI

- Help lists all style identifiers and examples.
- Parsing follows preset → style → explicit override precedence.
- Unknown style lists available styles.
- Braille with explicit ramp or edge glyphs fails before image decode and file creation.
- Structure with a custom fallback ramp succeeds.
- Compiled CLI produces text, Markdown, SVG, and all-format output for every new style.

### Browser and saved presets

- Style dropdown exposes all eight entries with accessible labels and descriptions.
- Applying each style updates the correct option quartet and requests one render.
- Tone, geometry, background, dither, Markdown, and ASCII edge-toggle edits retain the selected character style.
- Unsupported glyph-related combinations enter the custom state; disabling Structural Unicode reveals its fallback tone style.
- Version 1 storage/import migrates to version 2 defaults.
- Version 2 saves, reloads, imports, exports, updates, deletes, and restores correctly.
- Unsupported future versions leave storage and current controls unchanged.

### Production browser E2E

- Load a real fixture using the file input rather than only the generated demo canvas.
- Select Fine Blocks, Braille, and Structural Unicode in the production build.
- Verify status, metadata, non-empty preview, selected output, and absence of browser errors.
- Compare clipboard text with the selected textarea value.
- Compare downloaded TXT, Markdown, and SVG bytes with the expected generated output.
- Save a version 2 preset, reload, apply it, and confirm the style persists.
- Exercise 390-pixel mobile layout with the longest style labels.

## Fixture and golden-output corpus

Keep the existing `examples/demo-source.png` and byte-identical outputs. Add small deterministic fixtures covering:

- Grayscale gradient for ramp ordering.
- Transparent logo for alpha compositing.
- Horizontal, vertical, diagonal, corner, T-junction, and cross lines.
- Low-contrast portrait-like tone distribution.

Store text, Markdown, and SVG golden outputs for `blocks-fine`, `braille`, and `structure`. A verification script regenerates each output with the compiled CLI and compares bytes. Fixture licensing must permit repository distribution; generated geometric fixtures are preferred where a photograph is unnecessary.

## Package and release verification

New renderer modules compile into additional `dist-cli` JavaScript files. Therefore, the npm tarball must not be frozen to the historical count of 13 entries. The verifier continues to derive the expected `.js` list dynamically from `dist-cli`.

The package contract remains:

- CLI-only public package.
- Only compiled `dist-cli/**/*.js` plus npm's automatic `package.json`, `README.md`, and `LICENSE` entries.
- No source, tests, docs, examples, workflow files, source maps, declarations, or lockfile.
- No runtime dependency beyond the existing `sharp` range.

Required local acceptance commands:

```bash
npm run check
npm run test:coverage
npm run build
npm run test:e2e:built
npm run test:cli:built
npm run verify:examples
npm run verify:package
npm run release:check
npm pack --dry-run --foreground-scripts
npm publish --dry-run --foreground-scripts
```

The release gate must also pass on the configured supported Node majors: 20, 22, 24, and 26. Dry-run commands must not perform a real registry write.

## Acceptance criteria

- Existing strict-ASCII default and all five existing preset outputs are byte-identical.
- Fine Blocks exposes nine ordered levels including space and works with every dither mode.
- Braille uses true 2×4 subcell packing and never masquerades as a tone ramp.
- Structural Unicode emits straight, diagonal, corner, T, and cross glyphs based on coherent connectivity.
- Browser and CLI expose the same eight style identifiers.
- Browser controls remain compact with one Character Style selector.
- Saved preset version 1 migrates without data loss; version 2 persists the new fields.
- Text, Markdown, and accessible SVG work for all new styles.
- Validation rejects incompatible combinations before decode or output writes.
- Unit, coverage, production E2E, compiled CLI, golden examples, audit, package install, pack dry-run, and publish dry-run all pass.
- The public tarball remains CLI-only and uses a dynamically derived compiled-JavaScript allowlist.
- No Git operation, live npm publish, or unrelated interface redesign occurs.

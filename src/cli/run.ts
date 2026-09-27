import { basename, extname, resolve } from 'node:path';
import { parseCliCommand, type CliCommand, type CliFormat } from '../cli-options.js';
import { convertRgbaToAscii } from '../core/ascii.js';
import { toMarkdown } from '../core/markdown.js';
import { assertXmlText, toSvg } from '../core/svg.js';
import type { RgbaImage } from '../core/types.js';
import { resolveOutputDimensions, SUBCELL_GRID } from '../core/validation.js';

export const CLI_HELP = `
Charosaic CLI

Usage:
  charosaic <image> [options]
  npm run cli -- <image> [options]

Options:
  -p, --preset <name>       readme | portrait | logo | ultra | unicode
      --style <name>        readme | shape | detailed | soft | minimal | calibrated |
                            alphanumeric | classic | jp2a | bubbles | matrix | silhouette |
                            blocks | blocks-fine | bars | braille | structure
  -w, --width <columns>     Output width (2-400)
      --height <rows>       Override calculated row count
      --aspect <ratio>      Character width/height correction (default 0.5)
      --ramp <name|string>  readme | detailed | soft | minimal | calibrated | alphanumeric |
                            blocks | blocks-fine | bars | classic | jp2a | bubbles | matrix |
                            silhouette, or a custom ramp
      --dither <mode>       none | atkinson | floyd-steinberg | bayer
      --contrast <number>   Contrast multiplier
      --brightness <number> Brightness offset (-1 to 1)
      --gamma <number>      Gamma correction (0.1-10)
      --detail <number>     Local detail enhancement (0-2 recommended)
      --background <hex>    Alpha-compositing background, e.g. #ffffff
      --invert              Invert luminance before character mapping
      --edge-glyphs         Overlay -, |, / and \\ on strong edges
      --edge-threshold <n>  Edge glyph threshold (0-1)
      --no-auto-levels      Disable percentile-based auto levels
      --keep-trailing-spaces
                            Keep trailing spaces on every line
      --oversample <n>      Internal resize multiplier (1-5, default 3)
  -f, --format <format>     text | markdown | svg | all (default markdown)
  -o, --output <path>       Output file; with "all", use as the basename
      --collapsible         Wrap Markdown in an open <details> block
      --title <text>        SVG title and Markdown summary
  -h, --help                Show this help

Examples:
  charosaic portrait.jpg --preset portrait --output portrait.md
  charosaic logo.png --preset logo --format all --output docs/logo-ascii
  charosaic diagram.png --style structure --format svg -o diagram.svg
  charosaic photo.png --style shape --width 100 -o photo.md
  charosaic photo.png --style braille --format text -o photo.txt
  charosaic photo.webp --width 104 --dither atkinson --format svg -o art.svg
`;

export interface ImageMetadata {
  width?: number;
  height?: number;
  orientation?: number;
}

export interface CliRuntime {
  cwd: string;
  stdout(text: string): void;
  stderr(text: string): void;
  loadImage(path: string, width: number, height: number): Promise<RgbaImage>;
  metadata(path: string): Promise<ImageMetadata>;
  preflight(input: string, outputs: readonly string[]): Promise<void>;
  write(path: string, contents: string): Promise<void>;
}

export interface OutputTarget {
  format: Exclude<CliFormat, 'all'>;
  path: string;
  contents: string;
}

type OutputDestination = Omit<OutputTarget, 'contents'>;

function sourceDimensions(metadata: ImageMetadata): { width: number; height: number } {
  if (!metadata.width || !metadata.height) {
    throw new Error('Could not determine image dimensions.');
  }
  const orientation = metadata.orientation ?? 1;
  const swapped = orientation >= 5 && orientation <= 8;
  return swapped
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
}

function outputFor(
  format: Exclude<CliFormat, 'all'>,
  art: string,
  title: string,
  collapsible: boolean,
  cellAspectRatio: number,
): string {
  if (format === 'text') return `${art}\n`;
  if (format === 'markdown') {
    return toMarkdown(art, {
      collapsible,
      open: true,
      summary: title,
    });
  }
  return toSvg(art, { title: `${title} rendered as ASCII art`, cellAspectRatio });
}

function outputDestinations(command: CliCommand, cwd: string): OutputDestination[] {
  if (!command.outputPath) return [];

  const outputPath = resolve(cwd, command.outputPath);
  if (command.format !== 'all') {
    return [{ format: command.format, path: outputPath }];
  }

  const base = outputPath.replace(/\.(?:txt|md|svg)$/iu, '');
  return [
    { format: 'text', path: `${base}.txt` },
    { format: 'markdown', path: `${base}.md` },
    { format: 'svg', path: `${base}.svg` },
  ];
}

export async function runCli(args: readonly string[], runtime: CliRuntime): Promise<void> {
  const command = parseCliCommand([...args]);
  if (command.help) {
    runtime.stdout(CLI_HELP);
    return;
  }

  const title =
    command.title?.trim() || basename(command.input, extname(command.input)) || 'ASCII art';
  if (command.format === 'svg' || command.format === 'all') {
    assertXmlText('title', `${title} rendered as ASCII art`);
  }

  const inputPath = resolve(runtime.cwd, command.input);
  const metadata = await runtime.metadata(inputPath);
  const dimensions = sourceDimensions(metadata);
  const outputDimensions = resolveOutputDimensions(
    dimensions.width,
    dimensions.height,
    command.options.width,
    command.options.cellAspectRatio,
    command.height,
  );
  const destinations = outputDestinations(command, runtime.cwd);
  if (destinations.length > 0) {
    await runtime.preflight(
      inputPath,
      destinations.map((destination) => destination.path),
    );
  }

  const [subcellScaleX, subcellScaleY] =
    command.options.renderMode === 'tone' ? [1, 1] : SUBCELL_GRID[command.options.renderMode];
  const image = await runtime.loadImage(
    inputPath,
    outputDimensions.width * command.oversample * subcellScaleX,
    outputDimensions.height * command.oversample * subcellScaleY,
  );
  const result = convertRgbaToAscii(image, command.options, outputDimensions.height);
  if (destinations.length === 0) {
    runtime.stdout(
      outputFor(
        command.format as Exclude<CliFormat, 'all'>,
        result.art,
        title,
        command.collapsible,
        command.options.cellAspectRatio,
      ),
    );
    return;
  }

  const targets: OutputTarget[] = destinations.map((destination) => ({
    format: destination.format,
    path: destination.path,
    contents: outputFor(
      destination.format,
      result.art,
      title,
      command.collapsible,
      command.options.cellAspectRatio,
    ),
  }));
  await targets.reduce<Promise<void>>(async (previous, target) => {
    await previous;
    await runtime.write(target.path, target.contents);
    runtime.stderr(`Wrote ${target.path}\n`);
  }, Promise.resolve());
}

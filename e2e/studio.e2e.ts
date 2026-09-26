import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const sourceFixture = fileURLToPath(new URL('../examples/demo-source.png', import.meta.url));

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const sourceUrl = message.location().url;
      errors.push(`console${sourceUrl ? ` (${sourceUrl})` : ''}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function openReadyStudio(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page.locator('#status')).toHaveText('Ready');
  await expect(page.locator('#asciiPreview')).not.toBeEmpty();
}

async function downloadedText(page: Page, buttonName: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: buttonName, exact: true }).click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error(`Download ${buttonName} has no local path.`);
  return readFile(path, 'utf8');
}

test('converts the demo and keeps the production interaction path working', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await openReadyStudio(page);

  await expect(page).toHaveTitle('Charosaic');
  await expect(page.locator('#sourceMeta')).toHaveText('charosaic-demo · 960 × 600px');
  await expect(page.locator('#resultMeta')).toHaveText(
    '88 columns × 28 rows · 10 glyph levels · atkinson',
  );
  await expect(page.locator('#output')).toHaveValue(/^```text\n/u);

  await page.getByRole('combobox', { name: /BUILT-IN PRESETS README balanced/u }).click();
  await page.getByRole('option', { name: /^Logo \/ line art/u }).click();
  await expect(page.locator('#resultMeta')).toHaveText(
    '76 columns × 24 rows · 8 glyph levels · none',
  );
  await expect(page.locator('#status')).toHaveText('Ready');
  await expect(page.locator('#width')).toHaveValue('76');
  await expect(page.locator('#dither')).toHaveValue('none');
  await expect(page.locator('#edgeGlyphs')).toBeChecked();

  const logoArt = await page.locator('#asciiPreview').textContent();
  expect(logoArt).toBeTruthy();
  expect(logoArt).toMatch(/[|/\\]/u);

  const asciiButton = page.getByRole('button', { name: 'ASCII', exact: true });
  await asciiButton.click();
  await expect(asciiButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#output')).toHaveValue(`${logoArt}\n`);

  const svgButton = page.getByRole('button', { name: 'SVG', exact: true });
  await svgButton.click();
  await expect(svgButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#output')).toHaveValue(/^<\?xml[\s\S]*role="img"/u);

  const markdownButton = page.getByRole('button', { name: 'Markdown', exact: true });
  await markdownButton.click();
  await page.getByRole('checkbox', { name: 'Markdown details block' }).check();
  await expect(page.locator('#output')).toHaveValue(/^<details open>/u);

  await page.getByRole('button', { name: 'Copy Markdown', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Copied markdown output to clipboard.');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .md', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('charosaic-demo.md');
  expect(browserErrors).toEqual([]);
});

test('keeps the rendered studio inside a 390px mobile viewport', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyStudio(page);

  await page.getByRole('combobox', { name: /Character style/u }).click();
  const structuralOption = page.getByRole('option', { name: /^Structural Unicode/u });
  const optionBox = await structuralOption.boundingBox();
  expect(optionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await structuralOption.click();
  await expect(page.locator('#resultMeta')).toContainText('Structural Unicode');
  await expect(page.locator('#characterStyleValue')).toHaveText('Structural Unicode');
  await expect(page.locator('#characterStyleValueDescription')).toBeVisible();

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const preview = document.querySelector<HTMLElement>('#asciiPreview');
    return {
      page: root.scrollWidth > root.clientWidth,
      preview: preview ? preview.scrollWidth > preview.clientWidth : true,
    };
  });

  expect(overflow).toEqual({ page: false, preview: false });
  await expect(page.getByRole('region', { name: 'Conversion Controls' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Generated Result' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('uses every new style through upload, copy, download, and saved-preset workflows', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await openReadyStudio(page);
  await page.locator('#fileInput').setInputFiles(sourceFixture);
  await expect(page.locator('#sourceMeta')).toContainText('demo-source · 960 × 600px');
  await expect(page.locator('#status')).toHaveText('Ready');

  const styles = [
    { option: 'Shape match', id: 'shape', meta: 'Shape match 3×4 regions' },
    { option: 'Fine blocks', id: 'blocks-fine', meta: '9 glyph levels' },
    { option: 'Braille subcells', id: 'braille', meta: 'Braille 2×4 subcells' },
    { option: 'Structural Unicode', id: 'structure', meta: 'Structural Unicode' },
  ] as const;
  const outputs = [
    { tab: 'ASCII', copy: 'Copy ASCII', download: 'Download .txt' },
    { tab: 'Markdown', copy: 'Copy Markdown', download: 'Download .md' },
    { tab: 'SVG', copy: 'Copy SVG', download: 'Download .svg' },
  ] as const;

  await styles.reduce<Promise<void>>(async (previousStyle, style) => {
    await previousStyle;
    await page.getByRole('combobox', { name: /Character style/u }).click();
    await page.getByRole('option', { name: new RegExp(`^${style.option}`, 'u') }).click();
    await expect(page.locator('#characterStyle')).toHaveValue(style.id);
    await expect(page.locator('#resultMeta')).toContainText(style.meta);
    await expect(page.locator('#status')).toHaveText('Ready');
    await expect(page.locator('#asciiPreview')).not.toBeEmpty();

    await outputs.reduce<Promise<void>>(async (previousOutput, output) => {
      await previousOutput;
      await page.getByRole('button', { name: output.tab, exact: true }).click();
      const textarea = page.locator('#output');
      const expected = await textarea.inputValue();
      expect(expected).not.toBe('');

      await page.getByRole('button', { name: output.copy, exact: true }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
      expect(await downloadedText(page, output.download)).toBe(expected);
    }, Promise.resolve());
  }, Promise.resolve());

  await page.locator('#customPresetName').fill('Structural README');
  await page.getByRole('button', { name: 'Save as New', exact: true }).click();
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Ready');
  await page
    .getByRole('button', { name: 'Apply saved preset Structural README', exact: true })
    .click();
  await expect(page.locator('#characterStyle')).toHaveValue('structure');
  await expect(page.locator('#edgeGlyphs')).toBeChecked();
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    'charosaic.custom-presets.v1',
  );
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!)).toEqual([
    expect.objectContaining({
      schemaVersion: 2,
      settings: expect.objectContaining({
        options: expect.objectContaining({ renderMode: 'tone', edgeStyle: 'unicode' }),
      }),
    }),
  ]);
  expect(browserErrors).toEqual([]);
});

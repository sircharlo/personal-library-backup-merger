import { expect, test, type Page } from '@playwright/test';
import { writeFixtures, type E2eFixtures } from './fixtures';

let files: E2eFixtures;

test.beforeAll(async () => {
  files = await writeFixtures();
});

/** Page errors and console errors fail the test — the UI must never break silently. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

test('merges two backups with a note conflict, end to end', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Add your backups' })).toBeVisible();

  await page.locator('input[type=file]').setInputFiles([files.phone, files.tablet]);
  await expect(page.getByText('Ready', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Phone', { exact: true })).toBeVisible();
  await expect(page.getByText('Tablet', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Compare 2 backups' }).click();
  await expect(page.getByText('1 item needs your decision')).toBeVisible();
  await expect(page.getByText('Backups compared')).toBeVisible();

  await page.getByRole('button', { name: 'Review 1 decision' }).click();
  const candidates = page.getByRole('radio');
  await expect(candidates).toHaveCount(2);
  // Candidates follow upload order; the tablet copy is newer, so it is pre-selected.
  await expect(candidates.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Suggested', { exact: true })).toBeVisible();

  await candidates.nth(0).click();
  await expect(candidates.nth(0)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('1 changed from the suggestion')).toBeVisible();

  await page.getByRole('button', { name: 'Show differences' }).click();
  await expect(page.getByText(/What changes if you keep/)).toBeVisible();

  // Keep both: every candidate shows as kept and nothing will be discarded.
  await page.getByRole('button', { name: 'Keep both' }).click();
  await expect(page.getByText('Both kept')).toBeVisible();
  await expect(page.getByText('1 keeping both')).toBeVisible();
  await expect(candidates.nth(0)).toHaveAttribute('aria-checked', 'true');
  await expect(candidates.nth(1)).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'Continue to download' }).click();
  await expect(page.getByText('1 decision applied')).toBeVisible();
  await expect(page.getByText(/0 using the suggested version, 0 changed by you, 1 keeping both versions/)).toBeVisible();
  // phone-only + tablet-only + both versions of the shared note
  await expect(page.locator('.tile', { hasText: 'Notes' })).toContainText('4');

  await page.getByRole('button', { name: 'Build merged backup' }).click();
  await expect(page.getByText('Re-open test')).toBeVisible();
  await expect(page.getByText('every reference resolves')).toBeVisible();
  await expect(page.getByText('Do not restore this file')).toHaveCount(0);

  const link = page.locator('a[download]');
  await expect(link).toHaveAttribute('download', /^UserdataBackup_.*_Merged\.jwlibrary$/);
  await expect(link).toHaveAttribute('href', /^blob:/);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('a single backup skips the decision step', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.locator('input[type=file]').setInputFiles([files.phone]);
  await expect(page.getByText('Ready', { exact: true })).toHaveCount(1);

  await page.getByRole('button', { name: 'Check this backup' }).click();
  await expect(page.getByText('Everything merged cleanly')).toBeVisible();

  await page.getByRole('button', { name: 'Continue to download' }).click();
  await expect(page.getByText('No decisions were needed')).toBeVisible();
  await page.getByRole('button', { name: 'Build merged backup' }).click();
  await expect(page.locator('a[download]')).toHaveAttribute('href', /^blob:/);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('rejects files that are not backups without breaking', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText('notes.txt: not a .jwlibrary file')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add backups to begin' })).toBeDisabled();
  expect(errors, errors.join('\n')).toEqual([]);
});

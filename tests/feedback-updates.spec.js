const { test, expect } = require('@playwright/test');

const csvContent = [
  'Feature title,Feature overview,Problem being solved,Primary user,Also affects,How identified,Supporting evidence,Compliance,Data needs,External dependency,Requestor,Sponsor,Effort estimate,Strategic pillar',
  '"Medication reminders","Daily reminder notifications","Users miss doses without reminders","Patient / App user","Carers","User research","Interview evidence","GDPR","Push integration","No external dependency","Alice Product","Clinical Lead A","3","1"',
  '"Lab result alerts","Notify when test results arrive","Patients call clinics repeatedly for results","Patient / App user","Clinical staff","Patient feedback / complaint","Support call trend","HIQA","Lab feed integration","Yes - vendor dependency","Bob Product","Clinical Lead B","5","2"'
].join('\n');

test('CSV import and guide RICE/JPD updates', async ({ page }) => {
  await page.goto('/src/hse-feature-intake.html');

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import from CSV' }).click()
  ]);

  await fileChooser.setFiles({
    name: 'ideas.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvContent, 'utf8')
  });

  await expect(page.locator('#csv-import-picker')).toBeVisible();
  await expect(page.locator('#csv-row-select option')).toHaveCount(2);

  await page.selectOption('#csv-row-select', '1');
  await page.getByRole('button', { name: 'Load row' }).click();
  await expect(page.locator('#f-title')).toHaveValue('Lab result alerts');
  await expect(page.locator('#f-requestor')).toHaveValue('Bob Product');

  await page.selectOption('#csv-row-select', '0');
  await page.getByRole('button', { name: 'Load row' }).click();
  await expect(page.locator('#f-title')).toHaveValue('Medication reminders');
  await expect(page.locator('#f-requestor')).toHaveValue('Alice Product');

  await expect(page.locator('#csv-import-warning')).toContainText('Could not map: Effort estimate, Strategic pillar');

  await page.getByRole('button', { name: "Next: who it's for →" }).click();
  await page.getByRole('button', { name: 'Next: RICE score →' }).click();

  await page.locator('.outcomes-grid input[type="checkbox"]').first().check();
  await page.locator('#f-effort').fill('3');
  await page.locator('#f-reach').fill('45000');
  await page.locator('#f-reach-source').fill('CSO health statistics');
  await page.locator('#rice-btn').click();

  await expect(page.locator('.rt-label')).toContainText('Guide RICE score');
  await expect(page.locator('.rice-cell').first()).toContainText('Source: CSO health statistics');

  await page.locator('#rice-btn').click();
  await expect(page.locator('#mdOut')).toContainText('## RICE score (guide)');
  await expect(page.locator('#mdOut')).toContainText('| **Notes** | Reach: CSO health statistics.');
});

import { chromium } from 'playwright';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const csvContent = [
  'Feature title,Feature overview,Problem being solved,Primary user,Also affects,How identified,Supporting evidence,Compliance,Data needs,External dependency,Requestor,Sponsor,Effort estimate,Strategic pillar',
  '"Medication reminders","Daily reminder notifications","Users miss doses without reminders","Patient / App user","Carers","User research","Interview evidence","GDPR","Push integration","No external dependency","Alice Product","Clinical Lead A","3","1"',
  '"Lab result alerts","Notify when test results arrive","Patients call clinics repeatedly for results","Patient / App user","Clinical staff","Patient feedback / complaint","Support call trend","HIQA","Lab feed integration","Yes - vendor dependency","Bob Product","Clinical Lead B","5","2"'
].join('\n');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto('http://localhost:8080/src/hse-feature-intake.html', { waitUntil: 'networkidle' });

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('button:has-text("Import from CSV")')
  ]);
  await fileChooser.setFiles({
    name: 'ideas.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvContent, 'utf8')
  });

  await page.waitForSelector('#csv-import-picker', { state: 'visible' });
  const optionCount = await page.locator('#csv-row-select option').count();
  assert(optionCount === 2, `Expected 2 row options, got ${optionCount}`);

  await page.selectOption('#csv-row-select', '1');
  await page.click('button:has-text("Load row")');
  await page.waitForSelector('#csv-import-success', { state: 'visible' });
  assert((await page.inputValue('#f-title')) === 'Lab result alerts', 'Row 2 title did not import');
  assert((await page.inputValue('#f-requestor')) === 'Bob Product', 'Row 2 requestor did not import');

  await page.selectOption('#csv-row-select', '0');
  await page.click('button:has-text("Load row")');
  assert((await page.inputValue('#f-title')) === 'Medication reminders', 'Row 1 title did not import');
  assert((await page.inputValue('#f-requestor')) === 'Alice Product', 'Row 1 requestor did not import');

  const warningText = await page.textContent('#csv-import-warning');
  assert(warningText && warningText.includes('Effort estimate') && warningText.includes('Strategic pillar'), 'Unmapped column warning missing expected columns');

  await page.click("button:has-text(\"Next: who it's for →\")");
  await page.waitForSelector('#p1.panel.active');
  await page.click('button:has-text("Next: RICE score →")');
  await page.waitForSelector('#p2.panel.active');

  await page.check('.outcomes-grid input[type="checkbox"]');
  await page.fill('#f-effort', '3');
  await page.fill('#f-reach', '45000');
  await page.fill('#f-reach-source', 'CSO health statistics');
  await page.click('#rice-btn');

  await page.waitForSelector('.rt-label:has-text("Guide RICE score")', { timeout: 15000 });
  const reachCellText = await page.textContent('.rice-cell .rn');
  assert(reachCellText && reachCellText.includes('Source: CSO health statistics'), 'Reach source missing from RICE results');

  await page.click('#rice-btn');
  await page.waitForSelector('#mdOut', { timeout: 15000 });
  const md = await page.textContent('#mdOut');
  assert(md && md.includes('## RICE score (guide)'), 'JPD output missing guide heading');
  assert(md && md.includes('| **Notes** | Reach: CSO health statistics.'), 'JPD output missing notes row');

  console.log('PASS: CSV row picker, field mapping, RICE guide labels, and JPD notes row verified.');
} finally {
  await browser.close();
}

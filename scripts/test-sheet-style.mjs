import assert from 'node:assert/strict';
import { readJson, workflowPath } from './lib.mjs';
import { START_SHEET_ID, existingFromSpreadsheet, styleRequests, validateStyleSpec } from './sheet-style.mjs';
import { validateSpec } from './sheet-template.mjs';

const spec = readJson(workflowPath('youtube-niche-breakout-finder', 'assets/sheet-template.json'));
assert.deepEqual(validateStyleSpec(spec), []);
const bare = { title: 'Bare - n8n Template', tabs: [{ name: 'Data', headers: ['a', 'b'], exampleRows: [['x', 'y']] }] };
assert.match(validateStyleSpec(bare).join(' '), /startHere is required/);
assert.ok(validateSpec(bare).length > 0, 'a spec without the house style must fail');
const noRows = { ...spec, tabs: [{ ...spec.tabs[0], exampleRows: [] }] };
assert.ok(validateSpec(noRows).every((e) => !/example rows/.test(e)), 'development specs may have no rows yet');
assert.ok(validateSpec(noRows, { requireExampleRows: true }).some((e) => /example rows/.test(e)), 'released specs need QA rows');

// A first run adds the Start here tab first; a rerun deletes and re-adds it, and resets rules and filter.
const first = styleRequests(spec, existingFromSpreadsheet({ sheets: [{ properties: { sheetId: 0, title: 'Breakouts', gridProperties: { rowCount: 1000 } } }] }));
const add = first.find((r) => r.addSheet)?.addSheet.properties;
assert.equal(add.sheetId, START_SHEET_ID);
assert.equal(add.index, 0);
assert.ok(!first.some((r) => r.deleteSheet));
const rerun = styleRequests(spec, existingFromSpreadsheet({ sheets: [
  { properties: { sheetId: 0, title: 'Breakouts', gridProperties: { rowCount: 1000 } }, conditionalFormats: [{}, {}], basicFilter: {} },
  { properties: { sheetId: START_SHEET_ID, title: 'Start here', gridProperties: { rowCount: 40 } } }] }));
assert.equal(rerun.filter((r) => r.deleteConditionalFormatRule).length, 2);
assert.ok(rerun.some((r) => r.clearBasicFilter) && rerun.some((r) => r.deleteSheet?.sheetId === START_SHEET_ID));
// The data tab keeps sheetId 0, which the workflow's Google Sheets nodes select.
assert.ok(first.some((r) => r.updateSheetProperties?.properties.sheetId === 0));
// Link columns become HYPERLINK cells with a short label.
const cells = first.find((r) => r.updateCells?.start?.sheetId === 0).updateCells.rows[1].values;
assert.match(cells[spec.tabs[0].headers.indexOf('Video URL')].userEnteredValue.formulaValue, /^=HYPERLINK\(".+","Watch video"\)$/);
console.log('sheet-style tests passed');

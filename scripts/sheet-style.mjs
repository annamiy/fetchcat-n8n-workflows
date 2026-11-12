// FetchCat house style for public Google Sheets templates.
//
// Every template sheet looks like the first seven published ones (reference:
// "TikTok Profiles to Google Sheets - n8n Template"):
//   - a "Start here" tab first: title band, what the sheet does, a numbered
//     setup checklist, optional column guide, Apify and n8n links, a note on
//     the example rows;
//   - styled data tabs: lime header row, Inter font, pale rows with thin
//     separators, widths, number formats, wrapped long text, a filter, colour
//     rules and real public example rows from QA.
//
// styleRequests() returns Sheets API batchUpdate requests that turn an
// existing spreadsheet into that layout. It keeps every data tab's sheetId
// (workflows select tabs by id) and replaces the Start here tab, filters,
// colour rules and example rows, so a rerun gives the same result.

export const PALETTE = {
  ink: '11130F', lime: 'D9F23F', limeSoft: 'EEF7C3', paper: 'F8F9F2', white: 'FFFFFF',
  muted: '3C4137', grey: '697061', line: 'D3D8CC', note: 'EFEFEF', red: 'FFD9D5', amber: 'FFF0C2',
};
export const START_SHEET_ID = 900001;
const FONT = 'Inter';

const rgb = (hex) => ({ red: parseInt(hex.slice(0, 2), 16) / 255, green: parseInt(hex.slice(2, 4), 16) / 255, blue: parseInt(hex.slice(4, 6), 16) / 255 });
const text = (fg = PALETTE.ink, extra = {}) => ({ fontFamily: FONT, fontSize: 10, foregroundColor: rgb(fg), ...extra });
const thinBottom = { bottom: { style: 'SOLID', color: rgb(PALETTE.line) } };

const NUMBER_FORMATS = {
  integer: { type: 'NUMBER', pattern: '#,##0' },
  decimal: { type: 'NUMBER', pattern: '#,##0.00' },
  ratio: { type: 'NUMBER', pattern: '0.00"x"' },
  percent: { type: 'PERCENT', pattern: '0.0%' },
  datetime: { type: 'DATE_TIME', pattern: 'dd mmm yyyy, hh:mm' },
  date: { type: 'DATE', pattern: 'dd mmm yyyy' },
};
const RIGHT = new Set(['integer', 'decimal', 'ratio', 'percent']);

function cellValue(value) {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value === 'number') return { userEnteredValue: { numberValue: value } };
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  const s = String(value);
  if (s.startsWith('=')) return { userEnteredValue: { formulaValue: s } };
  return { userEnteredValue: { stringValue: s } };
}

const quote = (s) => String(s).replace(/"/g, '""');
// A link column shows a short label and keeps the URL behind it.
export function linkFormula(url, label) {
  if (!url) return '';
  return `=HYPERLINK("${quote(url)}","${quote(label)}")`;
}

function startHereRequests(spec) {
  const s = spec.startHere;
  const id = START_SHEET_ID;
  const rows = [];
  const merges = [];
  const heights = [];
  const add = (cells, height, mergeFrom = null) => {
    const r = rows.length;
    rows.push(cells);
    if (height) heights.push([r, height]);
    if (mergeFrom !== null) merges.push([r, mergeFrom]);
    return r;
  };
  const band = (value, fmt, height) => add([{ ...cellValue(value), userEnteredFormat: fmt }, ...Array.from({ length: 5 }, () => ({ userEnteredFormat: fmt }))], height, 0);
  const spacer = () => add(Array.from({ length: 6 }, () => ({ userEnteredFormat: { backgroundColor: rgb(PALETTE.paper) } })), 12);
  const fill = (bg) => ({ backgroundColor: rgb(bg), verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' });

  band(s.heading, { ...fill(PALETTE.lime), padding: { left: 10 }, textFormat: text(PALETTE.ink, { bold: true, fontSize: 19 }) }, 44);
  band(s.subtitle, { ...fill(PALETTE.lime), padding: { left: 10 }, textFormat: text(PALETTE.muted) }, 28);
  spacer();
  band(s.whatItDoesTitle ?? 'What this sheet does', { ...fill(PALETTE.limeSoft), textFormat: text(PALETTE.ink, { bold: true, fontSize: 11 }) }, 32);
  band(s.whatItDoes, { ...fill(PALETTE.white), verticalAlignment: 'TOP', textFormat: text(PALETTE.muted) }, Math.max(60, 20 * Math.ceil(s.whatItDoes.length / 95)));
  spacer();
  band('Setup checklist', { ...fill(PALETTE.ink), textFormat: text(PALETTE.lime, { bold: true, fontSize: 11 }) }, 32);
  const numbered = [...s.checklist, ...(s.links ?? []).map((l) => linkFormula(l.url, l.label))];
  numbered.forEach((item, i) => {
    const isLink = String(item).startsWith('=HYPERLINK');
    const badge = { ...cellValue(i + 1), userEnteredFormat: { ...fill(PALETTE.lime), horizontalAlignment: 'CENTER', borders: thinBottom, textFormat: text(PALETTE.ink, { bold: true, fontSize: 11 }) } };
    const body = { ...fill(PALETTE.white), padding: { left: 8 }, borders: thinBottom, textFormat: text(isLink ? PALETTE.muted : PALETTE.ink, isLink ? { bold: true, underline: true } : {}) };
    add([badge, { ...cellValue(item), userEnteredFormat: body }, ...Array.from({ length: 4 }, () => ({ userEnteredFormat: body }))], String(item).length > 95 ? 46 : 34, 1);
  });
  if (s.columnGuide?.length) {
    spacer();
    band('Column guide', { ...fill(PALETTE.limeSoft), textFormat: text(PALETTE.ink, { bold: true, fontSize: 11 }) }, 32);
    for (const [name, meaning] of s.columnGuide) {
      const key = { ...cellValue(name), userEnteredFormat: { ...fill(PALETTE.white), padding: { left: 8 }, borders: thinBottom, textFormat: text(PALETTE.ink, { bold: true }) } };
      const body = { ...fill(PALETTE.white), padding: { left: 8 }, borders: thinBottom, textFormat: text(PALETTE.muted) };
      const lead = { userEnteredFormat: { ...fill(PALETTE.white), borders: thinBottom } };
      add([lead, key, { ...cellValue(meaning), userEnteredFormat: body }, ...Array.from({ length: 3 }, () => ({ userEnteredFormat: body }))], 30, 2);
    }
  }
  spacer();
  band(s.dataNote, { ...fill(PALETTE.note), padding: { left: 10 }, textFormat: text(PALETTE.muted, { italic: true }) }, 42);

  const firstCol = 46;
  const requests = [
    { addSheet: { properties: { sheetId: id, title: 'Start here', index: 0, tabColorStyle: { rgbColor: rgb(PALETTE.ink) }, gridProperties: { rowCount: Math.max(rows.length + 5, 40), columnCount: 6, hideGridlines: true } } } },
    // Pale page background below and around the content, as in the reference sheets.
    { repeatCell: { range: { sheetId: id }, cell: { userEnteredFormat: { backgroundColor: rgb(PALETTE.paper), textFormat: text() } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { updateCells: { start: { sheetId: id, rowIndex: 0, columnIndex: 0 }, rows: rows.map((values) => ({ values })), fields: 'userEnteredValue,userEnteredFormat' } },
    { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: firstCol }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 1, endIndex: 6 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
    ...merges.map(([r, from]) => ({ mergeCells: { range: { sheetId: id, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: from, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } })),
    ...heights.map(([r, px]) => ({ updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: r, endIndex: r + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
  ];
  return requests;
}

function highlightRules(sheetId, col, rule, index) {
  const range = [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: col, endColumnIndex: col + 1 }];
  const fmt = (bg, fg = PALETTE.ink) => ({ backgroundColor: rgb(bg), textFormat: { foregroundColor: rgb(fg) } });
  const out = [];
  const push = (booleanRule) => out.push({ addConditionalFormatRule: { index: index + out.length, rule: { ranges: range, booleanRule } } });
  if (rule.type === 'scale') {
    out.push({ addConditionalFormatRule: { index, rule: { ranges: range, gradientRule: {
      minpoint: { type: 'MIN', color: rgb(PALETTE.white) }, maxpoint: { type: 'MAX', color: rgb(PALETTE.lime) } } } } });
  } else if (rule.type === 'risk') {
    push({ condition: { type: 'NUMBER_GREATER_THAN_EQ', values: [{ userEnteredValue: String(rule.high ?? 4) }] }, format: fmt(PALETTE.red) });
    push({ condition: { type: 'NUMBER_EQ', values: [{ userEnteredValue: String(rule.medium ?? 3) }] }, format: fmt(PALETTE.amber) });
    push({ condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: String(rule.medium ?? 3) }] }, format: fmt(PALETTE.note, PALETTE.grey) });
  } else if (rule.type === 'yesno') {
    push({ condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: rule.yes ?? 'yes' }] }, format: fmt(PALETTE.limeSoft, PALETTE.muted) });
    push({ condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: rule.no ?? 'no' }] }, format: fmt(PALETTE.note, PALETTE.grey) });
  } else if (rule.type === 'equals') {
    for (const [value, colour] of Object.entries(rule.values)) push({ condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: value }] }, format: fmt(PALETTE[colour] ?? colour) });
  }
  return out;
}

function dataTabRequests(tab, sheetId, existing) {
  const cols = tab.headers.length;
  const spec = (h) => tab.columns?.[h] ?? {};
  const requests = [];
  // Reset what a previous run added, so the result is the same every time.
  for (let i = (existing.conditionalFormats ?? 0) - 1; i >= 0; i -= 1) requests.push({ deleteConditionalFormatRule: { sheetId, index: i } });
  if (existing.basicFilter) requests.push({ clearBasicFilter: { sheetId } });
  if (existing.rowCount > 1) requests.push({ updateCells: { range: { sheetId, startRowIndex: 1, endRowIndex: existing.rowCount }, fields: 'userEnteredValue,userEnteredFormat' } });
  requests.push({ updateSheetProperties: { properties: { sheetId, title: tab.name, tabColorStyle: { rgbColor: rgb(PALETTE.lime) }, gridProperties: { frozenRowCount: 1, frozenColumnCount: tab.freezeColumns ?? 0, hideGridlines: true } }, fields: 'title,tabColorStyle,gridProperties.frozenRowCount,gridProperties.frozenColumnCount,gridProperties.hideGridlines' } });

  const header = tab.headers.map((h) => ({ ...cellValue(h), userEnteredFormat: {
    backgroundColor: rgb(PALETTE.lime), verticalAlignment: 'MIDDLE', horizontalAlignment: 'LEFT', wrapStrategy: 'WRAP',
    borders: { bottom: { style: 'SOLID_MEDIUM', color: rgb(PALETTE.ink) } }, textFormat: text(PALETTE.ink, { bold: true }) } }));
  const columnFormat = (h) => {
    const c = spec(h);
    const f = { backgroundColor: rgb(PALETTE.paper), verticalAlignment: 'MIDDLE', borders: thinBottom, textFormat: text(c.link ? PALETTE.muted : PALETTE.ink, c.link || c.strong ? { bold: true } : {}) };
    if (c.wrap) f.wrapStrategy = 'WRAP'; else f.wrapStrategy = 'CLIP';
    if (NUMBER_FORMATS[c.format]) f.numberFormat = NUMBER_FORMATS[c.format];
    if (RIGHT.has(c.format)) f.horizontalAlignment = 'RIGHT';
    if (c.align) f.horizontalAlignment = c.align.toUpperCase();
    return f;
  };
  const formats = tab.headers.map(columnFormat);
  const exampleRows = (tab.exampleRows ?? []).map((row) => tab.headers.map((h, i) => {
    const c = spec(h);
    const v = row[i];
    return { ...cellValue(c.link && v ? linkFormula(v, c.link) : v), userEnteredFormat: formats[i] };
  }));
  const emptyRows = Array.from({ length: Math.max(0, 30 - exampleRows.length) }, () => formats.map((f) => ({ userEnteredFormat: f })));
  requests.push({ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: [header, ...exampleRows, ...emptyRows].map((values) => ({ values })), fields: 'userEnteredValue,userEnteredFormat' } });
  // Rows beyond the styled block still get the font, background and formats.
  requests.push(...formats.map((f, i) => ({ repeatCell: { range: { sheetId, startRowIndex: 31 + Math.max(0, exampleRows.length - 30), endRowIndex: 1000, startColumnIndex: i, endColumnIndex: i + 1 }, cell: { userEnteredFormat: f }, fields: 'userEnteredFormat' } })));
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } });
  tab.headers.forEach((h, i) => {
    // Never narrower than the header plus its filter button, so headers do not wrap mid-word.
    const px = Math.max(spec(h).width ?? 120, Math.ceil(h.length * 7.6) + 44);
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } });
  });
  requests.push({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: cols } } } });
  let index = 0;
  tab.headers.forEach((h, i) => {
    const rule = spec(h).highlight;
    if (!rule) return;
    const added = highlightRules(sheetId, i, rule, index);
    index += added.length;
    requests.push(...added);
  });
  return requests;
}

// existing: { sheets: [{ sheetId, title, rowCount, conditionalFormats, basicFilter }] }
export function styleRequests(spec, existing) {
  const requests = [];
  if (existing.sheets.some((s) => s.sheetId === START_SHEET_ID)) requests.push({ deleteSheet: { sheetId: START_SHEET_ID } });
  spec.tabs.forEach((tab, i) => {
    const sheetId = tab.sheetId ?? i;
    const current = existing.sheets.find((s) => s.sheetId === sheetId);
    if (!current) requests.push({ addSheet: { properties: { sheetId, title: tab.name } } });
    requests.push(...dataTabRequests(tab, sheetId, current ?? { rowCount: 0 }));
  });
  requests.push(...startHereRequests(spec));
  return requests;
}

export function existingFromSpreadsheet(sheet) {
  return {
    sheets: (sheet.sheets ?? []).map((s) => ({
      sheetId: s.properties.sheetId, title: s.properties.title, rowCount: s.properties.gridProperties?.rowCount ?? 0,
      conditionalFormats: (s.conditionalFormats ?? []).length, basicFilter: Boolean(s.basicFilter),
    })),
  };
}

export function validateStyleSpec(spec) {
  const errors = [];
  const s = spec.startHere;
  if (!s || typeof s !== 'object') return ['startHere is required (heading, subtitle, whatItDoes, checklist, links, dataNote)'];
  for (const k of ['heading', 'subtitle', 'whatItDoes', 'dataNote']) if (typeof s[k] !== 'string' || !s[k].trim()) errors.push(`startHere.${k} is required`);
  if (!Array.isArray(s.checklist) || s.checklist.length < 3) errors.push('startHere.checklist needs at least 3 steps');
  if (!Array.isArray(s.links) || !s.links.some((l) => /^https:\/\/apify\.com\/fetch_cat\//.test(l.url ?? ''))) errors.push('startHere.links needs the FetchCat Actor link on apify.com');
  for (const tab of spec.tabs ?? []) {
    for (const h of Object.keys(tab.columns ?? {})) if (!tab.headers.includes(h)) errors.push(`${tab.name}: columns.${h} is not a header`);
    if (!tab.columns || Object.keys(tab.columns).length < Math.ceil(tab.headers.length / 2)) errors.push(`${tab.name}: set widths and formats in columns for most headers`);
    if ((tab.exampleRows ?? []).length < 3) errors.push(`${tab.name}: add at least 3 real public example rows from QA`);
  }
  return errors;
}

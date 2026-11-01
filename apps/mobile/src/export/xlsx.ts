import { strToU8, zipSync } from 'fflate';

/**
 * A small .xlsx writer: the few SpreadsheetML parts Excel, Google Sheets and LibreOffice
 * need, zipped with fflate. No Expo imports, so it runs the same in Node tests.
 * Text is written inline (no shared-strings table); the files are small enough.
 */

export type CellValue = string | number | null;

/** amount: whole rupees with Indian grouping (12,34,567). date / dateTime: Excel serial numbers. */
export type ColumnKind = 'text' | 'amount' | 'count' | 'date' | 'dateTime';

export interface Column {
  header: string;
  kind: ColumnKind;
  /** Width in characters. */
  width: number;
}

export interface Sheet {
  name: string;
  columns: Column[];
  rows: CellValue[][];
}

/** Calendar date "2026-02-14" → Excel serial (days since 30 Dec 1899). Never shifts a day. */
export function excelDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000 + 25_569;
}

/** Epoch ms → Excel serial in the phone's local time (Excel has no time zones). */
export function excelDateTime(ms: number, offsetMinutes = new Date(ms).getTimezoneOffset()): number {
  return (ms - offsetMinutes * 60_000) / 86_400_000 + 25_569;
}

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Style index per column kind; matches cellXfs in STYLES (0 = default, 1 = header). */
const STYLE: Record<ColumnKind, number> = { text: 0, count: 0, amount: 2, date: 3, dateTime: 4 };

const STYLES = `${XML}<styleSheet xmlns="${MAIN}">
<numFmts count="3">
<numFmt numFmtId="164" formatCode="[&gt;=10000000]##\\,##\\,##\\,##0;[&gt;=100000]##\\,##\\,##0;##,##0"/>
<numFmt numFmtId="165" formatCode="d mmm yyyy"/>
<numFmt numFmtId="166" formatCode="d mmm yyyy h:mm AM/PM"/>
</numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6E8EA"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Escapes text for XML and drops control characters XML can't hold. */
export function xmlText(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Sheet names: at most 31 characters, none of [ ] : * ? / \, unique. */
function sheetNames(sheets: readonly Sheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((s, i) => {
    let name = s.name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`;
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 28)} ${i + 1}`;
    used.add(name.toLowerCase());
    return name;
  });
}

function cell(ref: string, value: CellValue, style: number): string {
  if (value === null || value === '') return '';
  const s = style ? ` s="${style}"` : '';
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(value.slice(0, 32_767))}</t></is></c>`;
}

function worksheet(sheet: Sheet): string {
  const last = `${columnName(Math.max(sheet.columns.length - 1, 0))}${sheet.rows.length + 1}`;
  const cols = sheet.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join('');
  const header = `<row r="1">${sheet.columns.map((c, i) => cell(`${columnName(i)}1`, c.header, 1)).join('')}</row>`;
  const body = sheet.rows
    .map((row, r) => {
      const n = r + 2;
      return `<row r="${n}">${sheet.columns.map((c, i) => cell(`${columnName(i)}${n}`, row[i] ?? null, STYLE[c.kind])).join('')}</row>`;
    })
    .join('');
  return (
    `${XML}<worksheet xmlns="${MAIN}" xmlns:r="${REL}">` +
    `<dimension ref="A1:${last}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols}</cols><sheetData>${header}${body}</sheetData>` +
    `<autoFilter ref="A1:${last}"/></worksheet>`
  );
}

/** Builds the .xlsx file. Each sheet gets a bold, frozen header row with filters. */
export function buildWorkbook(sheets: readonly Sheet[]): Uint8Array {
  const names = sheetNames(sheets);
  const quoted = (name: string) => `'${name.replace(/'/g, "''")}'`;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join('') +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>` +
        names.map((name, i) => `<sheet name="${xmlText(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets><definedNames>' +
        sheets
          .map((s, i) => {
            const last = `$${columnName(Math.max(s.columns.length - 1, 0))}$${s.rows.length + 1}`;
            return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlText(quoted(names[i]!))}!$A$1:${last}</definedName>`;
          })
          .join('') +
        '</definedNames></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${XML}<Relationships xmlns="${PKG_REL}">` +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(STYLES),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(worksheet(s));
  });
  return zipSync(files, { level: 6 });
}

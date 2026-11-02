export interface CsvTable {
  header: string[];
  /** Data rows with their 1-based source line numbers (header is line 1). */
  rows: { line: number; cells: string[] }[];
}

export class CsvParseError extends Error {}

/**
 * Minimal RFC 4180 parser: comma separated, double-quoted fields, `""` escapes,
 * CRLF or LF line endings. Blank lines are skipped. A leading BOM is ignored.
 */
export function parseCsv(text: string): CsvTable {
  const input = text.replace(/^﻿/, '');
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordStart = 1;

  const endRecord = () => {
    cells.push(field);
    if (!(cells.length === 1 && cells[0].trim() === '')) {
      records.push({ line: recordStart, cells });
    }
    cells = [];
    field = '';
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordStart = line;
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new CsvParseError(`Unterminated quoted field starting on line ${recordStart}`);
  if (field !== '' || cells.length > 0) endRecord();

  if (records.length === 0) throw new CsvParseError('File is empty');
  const [headerRecord, ...rows] = records;
  return {
    header: headerRecord.cells.map((h) => h.trim().toLowerCase()),
    rows,
  };
}

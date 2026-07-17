import type { ApplicationData, VerificationResult } from './types'

/**
 * Minimal CSV handling for the batch workflow. Handles quoted fields and
 * embedded commas/newlines — enough for spreadsheet exports without a
 * dependency.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

const CSV_COLUMNS: Array<{ header: string; key: keyof ApplicationData }> = [
  { header: 'brand_name', key: 'brandName' },
  { header: 'class_type', key: 'classType' },
  { header: 'alcohol_content', key: 'alcoholContent' },
  { header: 'net_contents', key: 'netContents' },
  { header: 'producer', key: 'producer' },
  { header: 'country_of_origin', key: 'countryOfOrigin' },
]

export const CSV_TEMPLATE =
  'filename,' + CSV_COLUMNS.map((c) => c.header).join(',') + '\n' +
  'my-label.jpg,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,"45% Alc./Vol. (90 Proof)",750 mL,"Old Tom Distillery Co., Bardstown, KY",\n'

/** Parse an application-data CSV keyed by image filename. */
export function parseApplicationCsv(text: string): Map<string, Partial<ApplicationData>> {
  const rows = parseCsv(text)
  if (rows.length === 0) return new Map()
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const fileCol = header.findIndex((h) => h === 'filename' || h === 'file' || h === 'image')
  if (fileCol === -1) throw new Error('The CSV needs a "filename" column matching your image file names.')
  const map = new Map<string, Partial<ApplicationData>>()
  for (const row of rows.slice(1)) {
    const filename = row[fileCol]?.trim()
    if (!filename) continue
    const data: Partial<ApplicationData> = {}
    for (const col of CSV_COLUMNS) {
      const idx = header.indexOf(col.header)
      if (idx !== -1 && row[idx] !== undefined) data[col.key] = row[idx].trim()
    }
    map.set(filename.toLowerCase(), data)
  }
  return map
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface BatchRow {
  filename: string
  result?: VerificationResult
  error?: string
}

/** Export batch results for the agent's records. */
export function resultsToCsv(rows: BatchRow[]): string {
  const lines = ['filename,overall,seconds,details']
  for (const row of rows) {
    if (row.error) {
      lines.push([row.filename, 'ERROR', '', row.error].map(csvEscape).join(','))
      continue
    }
    if (!row.result) continue
    const details = [
      ...row.result.fields
        .filter((f) => f.status !== 'EXACT' && f.status !== 'NOT_CHECKED')
        .map((f) => `${f.label}: ${f.status} — ${f.note}`),
      ...row.result.warning.problems.map((p) => `Warning: ${p}`),
    ].join(' | ')
    lines.push(
      [row.filename, row.result.overall, (row.result.elapsedMs / 1000).toFixed(1), details]
        .map(csvEscape)
        .join(','),
    )
  }
  return lines.join('\n') + '\n'
}

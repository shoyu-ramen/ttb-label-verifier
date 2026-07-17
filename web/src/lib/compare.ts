import type {
  ApplicationData,
  Extraction,
  ExtractedField,
  FieldResult,
  FieldStatus,
  VerificationResult,
} from './types'
import { checkWarning } from './warning'

/**
 * Normalization for "same thing, different formatting" matching:
 * case, punctuation, accents, and whitespace are ignored. "STONE'S THROW"
 * and "Stone's Throw" normalize identically.
 */
export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface ParsedAlcohol {
  percent: number | null
  proof: number | null
}

/** Parse alcohol content from strings like "45% Alc./Vol. (90 Proof)", "Alc. 13.5% by Vol.", "90 proof". */
export function parseAlcohol(s: string): ParsedAlcohol {
  const pct = s.match(/(\d+(?:\.\d+)?)\s*%/)
  const proof = s.match(/(\d+(?:\.\d+)?)\s*(?:°\s*)?proof/i)
  let percent = pct ? parseFloat(pct[1]) : null
  if (percent === null) {
    // "Alc. 13.5 by vol" without % sign
    const byVol = s.match(/alc\.?\s*(\d+(?:\.\d+)?)\s*(?:by\s*vol|\/?\s*vol)/i)
    if (byVol) percent = parseFloat(byVol[1])
  }
  return { percent, proof: proof ? parseFloat(proof[1]) : null }
}

const ML_PER: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  cl: 10,
  centiliter: 10,
  centiliters: 10,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  'fl oz': 29.5735,
  'fluid ounce': 29.5735,
  'fluid ounces': 29.5735,
  oz: 29.5735,
  ounce: 29.5735,
  ounces: 29.5735,
  pt: 473.176,
  pint: 473.176,
  pints: 473.176,
  qt: 946.353,
  quart: 946.353,
  quarts: 946.353,
  gal: 3785.41,
  gallon: 3785.41,
  gallons: 3785.41,
}

/** Parse net contents to milliliters. "750 mL" → 750, "1 L" → 1000, "12 FL OZ" → 354.9. */
export function parseNetContents(s: string): number | null {
  const m = s
    .toLowerCase()
    .replace(/[.,](?=\D|$)/g, '')
    .match(/(\d+(?:[.,]\d+)?)\s*(fl\.?\s*oz|fluid ounces?|milliliters?|centiliters?|liters?|litres?|ml|cl|l|oz|ounces?|pints?|pt|quarts?|qt|gallons?|gal)\b/)
  if (!m) return null
  const value = parseFloat(m[1].replace(',', '.'))
  const unit = m[2].replace(/\./g, '').replace(/\s+/g, ' ').trim()
  const key = unit.startsWith('fl') ? 'fl oz' : unit
  const factor = ML_PER[key]
  return factor ? value * factor : null
}

function textResult(
  field: string,
  label: string,
  expected: string,
  extracted: ExtractedField,
  opts: { allowContains?: boolean } = {},
): FieldResult {
  const expectedTrim = expected.trim()
  if (!expectedTrim) {
    return { field, label, expected: '', found: extracted.value, status: 'NOT_CHECKED', note: 'No application value entered.' }
  }
  const found = extracted.value?.trim() ?? null
  if (!found) {
    const status: FieldStatus = extracted.confidence === 'low' ? 'NEEDS_REVIEW' : 'NOT_ON_LABEL'
    return {
      field, label, expected: expectedTrim, found: null, status,
      note: status === 'NEEDS_REVIEW'
        ? 'Could not read this from the image — please check by eye.'
        : 'Not found on the label.',
    }
  }
  if (found === expectedTrim) {
    return { field, label, expected: expectedTrim, found, status: 'EXACT', note: 'Matches exactly.' }
  }
  const ne = normalize(expectedTrim)
  const nf = normalize(found)
  if (ne === nf) {
    return {
      field, label, expected: expectedTrim, found, status: 'MATCH',
      note: 'Same wording — only capitalization or punctuation differs.',
    }
  }
  if (opts.allowContains && (nf.includes(ne) || ne.includes(nf))) {
    return {
      field, label, expected: expectedTrim, found, status: 'MATCH',
      note: 'The label wording contains the application wording (or vice versa).',
    }
  }
  if (extracted.confidence === 'low') {
    return {
      field, label, expected: expectedTrim, found, status: 'NEEDS_REVIEW',
      note: 'Possible mismatch, but the image was hard to read — please check by eye.',
    }
  }
  return { field, label, expected: expectedTrim, found, status: 'MISMATCH', note: 'Does not match the application.' }
}

function alcoholResult(expected: string, extracted: ExtractedField): FieldResult {
  const field = 'alcoholContent'
  const label = 'Alcohol content'
  const expectedTrim = expected.trim()
  if (!expectedTrim) {
    return { field, label, expected: '', found: extracted.value, status: 'NOT_CHECKED', note: 'No application value entered.' }
  }
  const found = extracted.value?.trim() ?? null
  if (!found) {
    const status: FieldStatus = extracted.confidence === 'low' ? 'NEEDS_REVIEW' : 'NOT_ON_LABEL'
    return {
      field, label, expected: expectedTrim, found: null, status,
      note: status === 'NEEDS_REVIEW'
        ? 'Could not read this from the image — please check by eye.'
        : 'Not found on the label.',
    }
  }
  const exp = parseAlcohol(expectedTrim)
  const got = parseAlcohol(found)
  const expPct = exp.percent ?? (exp.proof !== null ? exp.proof / 2 : null)
  const gotPct = got.percent ?? (got.proof !== null ? got.proof / 2 : null)
  if (expPct === null || gotPct === null) {
    // Can't parse a number — fall back to text comparison.
    return textResult(field, label, expectedTrim, extracted)
  }
  const notes: string[] = []
  if (Math.abs(expPct - gotPct) > 0.05) {
    return {
      field, label, expected: expectedTrim, found, status: 'MISMATCH',
      note: `Application says ${expPct}% ABV but the label reads ${gotPct}% ABV.`,
    }
  }
  if (got.percent !== null && got.proof !== null && Math.abs(got.proof - got.percent * 2) > 0.1) {
    notes.push(`Label is internally inconsistent: ${got.percent}% ABV should be ${got.percent * 2} proof, not ${got.proof}.`)
    return { field, label, expected: expectedTrim, found, status: 'MISMATCH', note: notes.join(' ') }
  }
  if (extracted.confidence === 'low') {
    return {
      field, label, expected: expectedTrim, found, status: 'NEEDS_REVIEW',
      note: 'Looks right, but the image was hard to read — please check by eye.',
    }
  }
  const exact = found === expectedTrim
  return {
    field, label, expected: expectedTrim, found, status: exact ? 'EXACT' : 'MATCH',
    note: exact ? 'Matches exactly.' : `Same alcohol content (${gotPct}% ABV) — written differently.`,
  }
}

function netContentsResult(expected: string, extracted: ExtractedField): FieldResult {
  const field = 'netContents'
  const label = 'Net contents'
  const expectedTrim = expected.trim()
  if (!expectedTrim) {
    return { field, label, expected: '', found: extracted.value, status: 'NOT_CHECKED', note: 'No application value entered.' }
  }
  const found = extracted.value?.trim() ?? null
  if (!found) {
    const status: FieldStatus = extracted.confidence === 'low' ? 'NEEDS_REVIEW' : 'NOT_ON_LABEL'
    return {
      field, label, expected: expectedTrim, found: null, status,
      note: status === 'NEEDS_REVIEW'
        ? 'Could not read this from the image — please check by eye.'
        : 'Not found on the label.',
    }
  }
  const expMl = parseNetContents(expectedTrim)
  const gotMl = parseNetContents(found)
  if (expMl === null || gotMl === null) {
    return textResult(field, label, expectedTrim, extracted)
  }
  if (Math.abs(expMl - gotMl) > 0.5) {
    return {
      field, label, expected: expectedTrim, found, status: 'MISMATCH',
      note: `Application says ${Math.round(expMl)} mL but the label reads ${Math.round(gotMl)} mL.`,
    }
  }
  if (extracted.confidence === 'low') {
    return {
      field, label, expected: expectedTrim, found, status: 'NEEDS_REVIEW',
      note: 'Looks right, but the image was hard to read — please check by eye.',
    }
  }
  const exact = found === expectedTrim
  return {
    field, label, expected: expectedTrim, found, status: exact ? 'EXACT' : 'MATCH',
    note: exact ? 'Matches exactly.' : 'Same volume — written differently.',
  }
}

/** Compare what the application claims against what the model read off the label. */
export function verify(app: ApplicationData, extraction: Extraction, elapsedMs: number): VerificationResult {
  const fields: FieldResult[] = [
    textResult('brandName', 'Brand name', app.brandName, extraction.brand_name),
    textResult('classType', 'Class / type', app.classType, extraction.class_type, { allowContains: true }),
    alcoholResult(app.alcoholContent, extraction.alcohol_content),
    netContentsResult(app.netContents, extraction.net_contents),
    textResult('producer', 'Bottler / producer', app.producer, extraction.producer, { allowContains: true }),
    textResult('countryOfOrigin', 'Country of origin', app.countryOfOrigin, extraction.country_of_origin, { allowContains: true }),
  ]

  const warning = checkWarning(
    extraction.government_warning.text_verbatim,
    extraction.government_warning.present,
    extraction.government_warning.confidence,
  )

  const anyFail =
    warning.status === 'FAIL' ||
    fields.some((f) => f.status === 'MISMATCH' || f.status === 'NOT_ON_LABEL')
  const anyReview =
    warning.status === 'NEEDS_REVIEW' ||
    fields.some((f) => f.status === 'NEEDS_REVIEW') ||
    !extraction.image_quality.readable

  const overall = anyFail ? 'FAIL' : anyReview ? 'NEEDS_REVIEW' : 'PASS'

  return {
    overall,
    fields,
    warning,
    imageIssues: extraction.image_quality.issues ?? [],
    elapsedMs,
  }
}

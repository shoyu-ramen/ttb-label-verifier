import type { WarningResult, Confidence } from './types'

/**
 * The mandatory health warning statement, 27 CFR Part 16 (Alcoholic
 * Beverage Labeling Act). The "GOVERNMENT WARNING:" prefix must appear
 * in capital letters; the body must appear word-for-word.
 */
export const WARNING_PREFIX = 'GOVERNMENT WARNING:'

export const WARNING_BODY =
  '(1) According to the Surgeon General, women should not drink ' +
  'alcoholic beverages during pregnancy because of the risk of birth ' +
  'defects. (2) Consumption of alcoholic beverages impairs your ability ' +
  'to drive a car or operate machinery, and may cause health problems.'

export const FULL_WARNING = `${WARNING_PREFIX} ${WARNING_BODY}`

/**
 * Normalize transcription artifacts that carry no compliance meaning:
 * curly quotes, long dashes, and runs of whitespace. Case is preserved —
 * case is part of the requirement.
 */
function normalizeGlyphs(s: string): string {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function words(s: string): string[] {
  return s.split(' ')
}

/** Letters and digits only — used to tell punctuation-level deviations from real rewording. */
function lettersOnly(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Strict check of the government warning as transcribed from the label
 * against the statutory text. Any deviation fails; problems are reported
 * in plain language so an agent can see exactly what is wrong.
 */
export function checkWarning(
  textVerbatim: string | null,
  present: boolean,
  confidence: Confidence,
): WarningResult {
  if (!present || !textVerbatim || !textVerbatim.trim()) {
    return {
      status: 'FAIL',
      found: null,
      problems: ['No government warning statement found on the label.'],
    }
  }

  const found = normalizeGlyphs(textVerbatim)
  const problems: string[] = []

  // If the image was hard to read AND the deviation is only at the level of
  // punctuation or capitalization, the "deviation" may be a transcription
  // artifact of a bad photo. Don't reject on a guess — ask for human eyes
  // (or a better image), which is what agents do today.
  const finalize = (): WarningResult => {
    const punctuationLevelOnly = lettersOnly(found) === lettersOnly(FULL_WARNING)
    if (confidence !== 'high' && punctuationLevelOnly) {
      return {
        status: 'NEEDS_REVIEW',
        found,
        problems: [
          ...problems,
          'The image was hard to read, so this deviation may not be real — confirm by eye or request a clearer image.',
        ],
      }
    }
    return { status: 'FAIL', found, problems }
  }

  // 1) Prefix must be present and in all capital letters.
  const prefixLen = WARNING_PREFIX.length
  const foundPrefix = found.slice(0, prefixLen)
  if (foundPrefix.toUpperCase() !== WARNING_PREFIX) {
    // Prefix wording itself is wrong (not just casing).
    problems.push(
      `The warning must begin with "${WARNING_PREFIX}" — the label reads "${found.slice(0, Math.min(40, found.length))}…".`,
    )
    return finalize()
  }
  if (foundPrefix !== WARNING_PREFIX) {
    problems.push(
      `"GOVERNMENT WARNING:" must be in all capital letters — the label reads "${foundPrefix}".`,
    )
  }

  // 2) Body must match word-for-word (whitespace-insensitive, case-sensitive).
  const foundBody = found.slice(prefixLen).trim()
  if (foundBody !== WARNING_BODY) {
    const expWords = words(WARNING_BODY)
    const gotWords = words(foundBody)
    let i = 0
    while (i < expWords.length && i < gotWords.length && expWords[i] === gotWords[i]) i++
    if (i < expWords.length && i < gotWords.length) {
      problems.push(
        `The warning text deviates from the required wording: expected "…${expWords.slice(Math.max(0, i - 3), i + 3).join(' ')}…" but the label reads "…${gotWords.slice(Math.max(0, i - 3), i + 3).join(' ')}…".`,
      )
    } else if (gotWords.length < expWords.length) {
      problems.push(
        `The warning text is incomplete — it stops before "…${expWords.slice(i, i + 6).join(' ')}…".`,
      )
    } else {
      problems.push('The warning contains extra text beyond the required wording.')
    }
  }

  if (problems.length > 0) {
    return finalize()
  }

  if (confidence === 'low') {
    return {
      status: 'NEEDS_REVIEW',
      found,
      problems: [
        'The warning appears correct, but the image was hard to read — please confirm by eye.',
      ],
    }
  }

  return { status: 'PASS', found, problems: [] }
}

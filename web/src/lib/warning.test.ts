import { describe, it, expect } from 'vitest'
import { checkWarning, FULL_WARNING, WARNING_BODY } from './warning'

describe('checkWarning', () => {
  it('passes the exact statutory warning', () => {
    const r = checkWarning(FULL_WARNING, true, 'high')
    expect(r.status).toBe('PASS')
    expect(r.problems).toEqual([])
  })

  it('passes with line breaks and extra whitespace (labels wrap text)', () => {
    const wrapped = FULL_WARNING.replace('Surgeon General,', 'Surgeon\nGeneral,').replace('  ', ' ')
    const r = checkWarning(wrapped, true, 'high')
    expect(r.status).toBe('PASS')
  })

  it('passes with curly apostrophes and long dashes (transcription artifacts)', () => {
    const curly = FULL_WARNING.replace(/'/g, '’')
    const r = checkWarning(curly, true, 'high')
    expect(r.status).toBe('PASS')
  })

  it('fails when the warning is missing', () => {
    const r = checkWarning(null, false, 'high')
    expect(r.status).toBe('FAIL')
    expect(r.problems[0]).toMatch(/No government warning/)
  })

  it('fails title-case prefix — the Jenny case', () => {
    const titleCase = `Government Warning: ${WARNING_BODY}`
    const r = checkWarning(titleCase, true, 'high')
    expect(r.status).toBe('FAIL')
    expect(r.problems[0]).toMatch(/all capital letters/)
    expect(r.problems[0]).toMatch(/Government Warning:/)
  })

  it('fails reworded body and reports the divergence', () => {
    const reworded = FULL_WARNING.replace('birth defects', 'developmental issues')
    const r = checkWarning(reworded, true, 'high')
    expect(r.status).toBe('FAIL')
    expect(r.problems[0]).toMatch(/deviates/)
  })

  it('fails a truncated warning', () => {
    const truncated = FULL_WARNING.slice(0, 120)
    const r = checkWarning(truncated, true, 'high')
    expect(r.status).toBe('FAIL')
  })

  it('fails when body case is altered (word-for-word means word-for-word)', () => {
    const shouty = `GOVERNMENT WARNING: ${WARNING_BODY.toUpperCase()}`
    const r = checkWarning(shouty, true, 'high')
    expect(r.status).toBe('FAIL')
  })

  it('needs review when correct but transcription confidence is low', () => {
    const r = checkWarning(FULL_WARNING, true, 'low')
    expect(r.status).toBe('NEEDS_REVIEW')
  })

  it('punctuation-level deviation on a hard-to-read image asks for review, not rejection', () => {
    const missingColon = FULL_WARNING.replace('GOVERNMENT WARNING:', 'GOVERNMENT WARNING')
    const r = checkWarning(missingColon, true, 'medium')
    expect(r.status).toBe('NEEDS_REVIEW')
    expect(r.problems.some((p) => /clearer image/.test(p))).toBe(true)
  })

  it('punctuation-level deviation on a clear image still fails', () => {
    const missingColon = FULL_WARNING.replace('GOVERNMENT WARNING:', 'GOVERNMENT WARNING')
    const r = checkWarning(missingColon, true, 'high')
    expect(r.status).toBe('FAIL')
  })

  it('real rewording fails even on a hard-to-read image', () => {
    const reworded = FULL_WARNING.replace('birth defects', 'development problems')
    const r = checkWarning(reworded, true, 'low')
    expect(r.status).toBe('FAIL')
  })

  it('fails wrong prefix wording', () => {
    const r = checkWarning(`WARNING: ${WARNING_BODY}`, true, 'high')
    expect(r.status).toBe('FAIL')
    expect(r.problems[0]).toMatch(/must begin with/)
  })
})

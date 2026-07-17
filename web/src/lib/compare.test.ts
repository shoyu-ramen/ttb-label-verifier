import { describe, it, expect } from 'vitest'
import { normalize, parseAlcohol, parseNetContents, verify } from './compare'
import { FULL_WARNING } from './warning'
import type { ApplicationData, Extraction } from './types'

const APP: ApplicationData = {
  brandName: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  alcoholContent: '45% Alc./Vol. (90 Proof)',
  netContents: '750 mL',
  producer: 'Old Tom Distillery Co., Bardstown, KY',
  countryOfOrigin: '',
}

function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    brand_name: { value: 'OLD TOM DISTILLERY', confidence: 'high' },
    class_type: { value: 'Kentucky Straight Bourbon Whiskey', confidence: 'high' },
    alcohol_content: { value: '45% Alc./Vol. (90 Proof)', confidence: 'high' },
    net_contents: { value: '750 mL', confidence: 'high' },
    producer: { value: 'Old Tom Distillery Co., Bardstown, KY', confidence: 'high' },
    country_of_origin: { value: null, confidence: 'high' },
    government_warning: { present: true, text_verbatim: FULL_WARNING, confidence: 'high' },
    image_quality: { readable: true, issues: [] },
    ...overrides,
  }
}

describe('normalize', () => {
  it('treats case and punctuation as equal — the Dave case', () => {
    expect(normalize("STONE'S THROW")).toBe(normalize("Stone's Throw"))
    expect(normalize('STONE’S THROW')).toBe(normalize("Stone's throw"))
  })
  it('still distinguishes different names', () => {
    expect(normalize("Stone's Throw")).not.toBe(normalize('Stonethrow Hollow'))
  })
})

describe('parseAlcohol', () => {
  it('parses percent and proof', () => {
    expect(parseAlcohol('45% Alc./Vol. (90 Proof)')).toEqual({ percent: 45, proof: 90 })
    expect(parseAlcohol('Alc. 13.5% by Vol.')).toEqual({ percent: 13.5, proof: null })
    expect(parseAlcohol('90 PROOF')).toEqual({ percent: null, proof: 90 })
  })
})

describe('parseNetContents', () => {
  it('normalizes units to mL', () => {
    expect(parseNetContents('750 mL')).toBe(750)
    expect(parseNetContents('750ML')).toBe(750)
    expect(parseNetContents('75 cl')).toBe(750)
    expect(parseNetContents('1 L')).toBe(1000)
    expect(parseNetContents('12 FL OZ')).toBeCloseTo(354.88, 1)
  })
})

describe('verify', () => {
  it('passes a fully compliant label', () => {
    const r = verify(APP, extraction(), 3200)
    expect(r.overall).toBe('PASS')
    expect(r.warning.status).toBe('PASS')
    expect(r.fields.find((f) => f.field === 'brandName')?.status).toBe('EXACT')
  })

  it('brand case difference is MATCH with a note, not a mismatch', () => {
    const r = verify(
      { ...APP, brandName: "Stone's Throw" },
      extraction({ brand_name: { value: "STONE'S THROW", confidence: 'high' } }),
      3000,
    )
    const brand = r.fields.find((f) => f.field === 'brandName')!
    expect(brand.status).toBe('MATCH')
    expect(brand.note).toMatch(/capitalization or punctuation/)
    expect(r.overall).toBe('PASS')
  })

  it('fails on wrong ABV with a plain-language note', () => {
    const r = verify(APP, extraction({ alcohol_content: { value: '40% Alc./Vol. (80 Proof)', confidence: 'high' } }), 3000)
    const abv = r.fields.find((f) => f.field === 'alcoholContent')!
    expect(abv.status).toBe('MISMATCH')
    expect(abv.note).toMatch(/45% ABV.*40% ABV/)
    expect(r.overall).toBe('FAIL')
  })

  it('matches equivalent ABV written as proof only', () => {
    const r = verify(APP, extraction({ alcohol_content: { value: '90 Proof', confidence: 'high' } }), 3000)
    expect(r.fields.find((f) => f.field === 'alcoholContent')?.status).toBe('MATCH')
  })

  it('flags internally inconsistent ABV/proof', () => {
    const r = verify(APP, extraction({ alcohol_content: { value: '45% Alc./Vol. (80 Proof)', confidence: 'high' } }), 3000)
    const abv = r.fields.find((f) => f.field === 'alcoholContent')!
    expect(abv.status).toBe('MISMATCH')
    expect(abv.note).toMatch(/internally inconsistent/)
  })

  it('matches equivalent net contents across units', () => {
    const r = verify(APP, extraction({ net_contents: { value: '75 cl', confidence: 'high' } }), 3000)
    expect(r.fields.find((f) => f.field === 'netContents')?.status).toBe('MATCH')
  })

  it('fails when a required field is absent from the label', () => {
    const r = verify(APP, extraction({ net_contents: { value: null, confidence: 'high' } }), 3000)
    expect(r.fields.find((f) => f.field === 'netContents')?.status).toBe('NOT_ON_LABEL')
    expect(r.overall).toBe('FAIL')
  })

  it('needs review instead of guessing when the image is hard to read', () => {
    const r = verify(
      APP,
      extraction({
        brand_name: { value: 'OLD TOM DISTILLER?', confidence: 'low' },
        image_quality: { readable: false, issues: ['glare across the brand name'] },
      }),
      3000,
    )
    expect(r.fields.find((f) => f.field === 'brandName')?.status).toBe('NEEDS_REVIEW')
    expect(r.overall).toBe('NEEDS_REVIEW')
  })

  it('title-case government warning fails the whole label', () => {
    const r = verify(
      APP,
      extraction({
        government_warning: {
          present: true,
          text_verbatim: FULL_WARNING.replace('GOVERNMENT WARNING:', 'Government Warning:'),
          confidence: 'high',
        },
      }),
      3000,
    )
    expect(r.warning.status).toBe('FAIL')
    expect(r.overall).toBe('FAIL')
  })

  it('skips fields with no application value', () => {
    const r = verify({ ...APP, producer: '', countryOfOrigin: '' }, extraction(), 3000)
    expect(r.fields.find((f) => f.field === 'producer')?.status).toBe('NOT_CHECKED')
  })
})

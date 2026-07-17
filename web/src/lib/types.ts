/** Application data an agent enters (what the COLA application claims). */
export interface ApplicationData {
  brandName: string
  classType: string
  alcoholContent: string
  netContents: string
  producer: string
  countryOfOrigin: string
}

export type Confidence = 'high' | 'medium' | 'low'

export interface ExtractedField {
  value: string | null
  confidence: Confidence
}

/** Structured output returned by the vision model via the Worker. */
export interface Extraction {
  brand_name: ExtractedField
  class_type: ExtractedField
  alcohol_content: ExtractedField
  net_contents: ExtractedField
  producer: ExtractedField
  country_of_origin: ExtractedField
  government_warning: {
    present: boolean
    text_verbatim: string | null
    confidence: Confidence
  }
  image_quality: {
    readable: boolean
    issues: string[]
  }
}

export interface VerifyResponse {
  extraction: Extraction
  model: string
  elapsed_ms: number
}

export type FieldStatus =
  | 'EXACT' // exact match
  | 'MATCH' // same thing, formatting differs (case/punctuation) — Dave's nuance
  | 'MISMATCH' // genuinely different
  | 'NOT_ON_LABEL' // expected but not found on label
  | 'NEEDS_REVIEW' // model unsure — human should look
  | 'NOT_CHECKED' // no application value provided

export interface FieldResult {
  field: string
  label: string
  expected: string
  found: string | null
  status: FieldStatus
  note: string
}

export type WarningStatus = 'PASS' | 'FAIL' | 'NEEDS_REVIEW'

export interface WarningResult {
  status: WarningStatus
  found: string | null
  problems: string[]
}

export type OverallStatus = 'PASS' | 'NEEDS_REVIEW' | 'FAIL'

export interface VerificationResult {
  overall: OverallStatus
  fields: FieldResult[]
  warning: WarningResult
  imageIssues: string[]
  elapsedMs: number
}

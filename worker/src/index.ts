/**
 * Purpose-built proxy for the label verifier UI. It accepts a label image,
 * runs a fixed extraction prompt against the Anthropic API, and returns the
 * structured extraction. It is not a general-purpose proxy: the prompt,
 * model, and output schema are pinned server-side, and the API key never
 * leaves this Worker. Nothing is stored.
 */

export interface Env {
  ANTHROPIC_API_KEY: string
}

const MODEL = 'claude-haiku-4-5'

const ALLOWED_ORIGINS = new Set([
  'https://shoyu-ramen.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
])

const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

// ~5 MB decoded — matches the Anthropic image size limit; the UI resizes
// before upload so real requests are far smaller.
const MAX_BASE64_LENGTH = 7_000_000

const EXTRACTION_TOOL = {
  name: 'record_label_extraction',
  description: 'Record every field read from the alcohol beverage label image.',
  input_schema: {
    type: 'object',
    properties: {
      brand_name: fieldSchema('The brand name as printed, preserving capitalization.'),
      class_type: fieldSchema('The class/type designation, e.g. "Kentucky Straight Bourbon Whiskey".'),
      alcohol_content: fieldSchema('The alcohol content exactly as printed, e.g. "45% Alc./Vol. (90 Proof)".'),
      net_contents: fieldSchema('The net contents exactly as printed, e.g. "750 mL".'),
      producer: fieldSchema('The name and address of the bottler/producer/importer as printed.'),
      country_of_origin: fieldSchema('The country of origin if printed, e.g. "Product of Scotland".'),
      government_warning: {
        type: 'object',
        properties: {
          present: { type: 'boolean', description: 'Whether any government health warning statement appears on the label.' },
          text_verbatim: {
            type: ['string', 'null'],
            description:
              'The complete warning statement transcribed EXACTLY as printed, character for character, preserving upper/lower case, punctuation, and numbering. Do NOT correct it to the standard wording — transcribe what is actually printed.',
          },
          confidence: confidenceSchema(),
        },
        required: ['present', 'text_verbatim', 'confidence'],
      },
      image_quality: {
        type: 'object',
        properties: {
          readable: { type: 'boolean', description: 'False if glare, blur, angle, or resolution prevented a confident reading of any field.' },
          issues: { type: 'array', items: { type: 'string' }, description: 'Short plain-language notes on image problems, e.g. "glare across the lower third".' },
        },
        required: ['readable', 'issues'],
      },
    },
    required: [
      'brand_name',
      'class_type',
      'alcohol_content',
      'net_contents',
      'producer',
      'country_of_origin',
      'government_warning',
      'image_quality',
    ],
  },
}

function fieldSchema(description: string) {
  return {
    type: 'object',
    properties: {
      value: { type: ['string', 'null'], description: `${description} null if not present on the label.` },
      confidence: confidenceSchema(),
    },
    required: ['value', 'confidence'],
  }
}

function confidenceSchema() {
  return {
    type: 'string',
    enum: ['high', 'medium', 'low'],
    description: 'high = clearly legible; medium = legible with minor doubt; low = hard to read (glare/blur/angle) — use low rather than guessing.',
  }
}

const SYSTEM_PROMPT = `You are assisting TTB (Alcohol and Tobacco Tax and Trade Bureau) compliance agents by reading alcohol beverage label images.

Read the label image and record every field with the record_label_extraction tool.

Rules:
- Transcribe text exactly as printed. Never normalize, correct, or complete text — if the label says "Government Warning" in title case, record it in title case.
- The government warning transcription must be character-exact, including capitalization and punctuation. This is used for a strict word-for-word compliance check.
- If a field is not on the label, record null with high confidence (you are confident it is absent).
- If part of the image is unreadable (glare, blur, odd angle, low resolution), record your best reading with low confidence and describe the problem in image_quality.issues. Never present a guess as a confident reading.
- Labels can be photographed at an angle or in poor lighting; do your best to read them anyway.
- The warning check is character-exact. If blur, glare, or resolution makes punctuation-level detail (colons, commas, periods) in the warning uncertain, report the government_warning confidence as medium or low — never high.`

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://shoyu-ramen.github.io'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (url.pathname === '/api/health') {
      return json({ ok: true }, 200, origin)
    }
    if (url.pathname !== '/api/verify' || request.method !== 'POST') {
      return json({ error: 'Not found' }, 404, origin)
    }

    let body: { image_base64?: string; media_type?: string }
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Request body must be JSON.' }, 400, origin)
    }

    const { image_base64, media_type } = body
    if (!image_base64 || !media_type) {
      return json({ error: 'image_base64 and media_type are required.' }, 400, origin)
    }
    if (!ALLOWED_MEDIA.has(media_type)) {
      return json({ error: `Unsupported image type: ${media_type}. Use JPEG, PNG, WebP, or GIF.` }, 415, origin)
    }
    if (image_base64.length > MAX_BASE64_LENGTH) {
      return json({ error: 'Image too large. Please use an image under 5 MB.' }, 413, origin)
    }

    const started = Date.now()
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: 'record_label_extraction' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type, data: image_base64 },
              },
              { type: 'text', text: 'Read this alcohol beverage label and record the extraction.' },
            ],
          },
        ],
      }),
    })

    if (!anthropicResponse.ok) {
      const detail = await anthropicResponse.text()
      console.error('Anthropic API error', anthropicResponse.status, detail.slice(0, 500))
      const friendly =
        anthropicResponse.status === 429
          ? 'The AI service is busy right now. Please try again in a moment.'
          : 'The AI service could not process this image. Please try again.'
      return json({ error: friendly }, 502, origin)
    }

    const message = (await anthropicResponse.json()) as {
      content: Array<{ type: string; name?: string; input?: unknown }>
    }
    const toolUse = message.content.find(
      (block) => block.type === 'tool_use' && block.name === 'record_label_extraction',
    )
    if (!toolUse?.input) {
      return json({ error: 'The AI service returned an unexpected response. Please try again.' }, 502, origin)
    }

    return json(
      { extraction: toolUse.input, model: MODEL, elapsed_ms: Date.now() - started },
      200,
      origin,
    )
  },
}

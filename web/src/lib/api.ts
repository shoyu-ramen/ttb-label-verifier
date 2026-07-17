import type { VerifyResponse } from './types'

/** Worker URL. Set VITE_API_URL at build time; falls back to local wrangler dev. */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8788'

export class ApiError extends Error {}

async function postVerify(imageBase64: string, mediaType: string, signal?: AbortSignal): Promise<VerifyResponse> {
  const res = await fetch(`${API_URL}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64, media_type: mediaType }),
    signal,
  })
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ApiError('The verification service sent an unreadable response. Please try again.')
  }
  if (!res.ok) {
    const message = (body as { error?: string }).error ?? 'The verification service reported an error.'
    throw new ApiError(message)
  }
  return body as VerifyResponse
}

/** Verify with one automatic retry on transient failure. */
export async function verifyImage(imageBase64: string, mediaType: string): Promise<VerifyResponse> {
  try {
    return await postVerify(imageBase64, mediaType)
  } catch (err) {
    if (err instanceof ApiError && !/too large|Unsupported/i.test(err.message)) {
      await new Promise((r) => setTimeout(r, 1000))
      return await postVerify(imageBase64, mediaType)
    }
    throw err
  }
}

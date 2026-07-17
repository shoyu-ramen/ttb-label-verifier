/**
 * Client-side image preparation: downscale big photos before upload.
 * Keeps requests small (fast round-trips — the 5-second budget) and under
 * the service's 5 MB limit. ~1600px on the long edge keeps label text
 * comfortably legible for the vision model.
 */

const MAX_EDGE = 1600

export interface PreparedImage {
  base64: string
  mediaType: string
  previewUrl: string
}

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED.has(file.type)) {
    throw new Error(`"${file.name}" is not a supported image. Please use JPEG, PNG, WebP, or GIF.`)
  }

  const bitmap = await createImageBitmap(await fileToBlob(file))
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))

  if (scale === 1 && file.size < 1_500_000) {
    const base64 = await blobToBase64(file)
    return { base64, mediaType: file.type, previewUrl: URL.createObjectURL(file) }
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))), 'image/jpeg', 0.9),
  )
  const base64 = await blobToBase64(blob)
  return { base64, mediaType: 'image/jpeg', previewUrl: URL.createObjectURL(blob) }
}

async function fileToBlob(file: File): Promise<Blob> {
  return file
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Could not read the image file.'))
    reader.readAsDataURL(blob)
  })
}

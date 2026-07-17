import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApplicationData, VerificationResult } from '../lib/types'
import { prepareImage, type PreparedImage } from '../lib/image'
import { verifyImage } from '../lib/api'
import { verify } from '../lib/compare'
import ResultCard from './ResultCard'
import type { Sample } from '../lib/samples'

export const EMPTY_APP: ApplicationData = {
  brandName: '',
  classType: '',
  alcoholContent: '',
  netContents: '',
  producer: '',
  countryOfOrigin: '',
}

const FORM_FIELDS: Array<{
  key: keyof ApplicationData
  label: string
  placeholder: string
  required?: boolean
}> = [
  { key: 'brandName', label: 'Brand name', placeholder: 'e.g. OLD TOM DISTILLERY', required: true },
  { key: 'classType', label: 'Class / type', placeholder: 'e.g. Kentucky Straight Bourbon Whiskey' },
  { key: 'alcoholContent', label: 'Alcohol content', placeholder: 'e.g. 45% Alc./Vol. (90 Proof)' },
  { key: 'netContents', label: 'Net contents', placeholder: 'e.g. 750 mL' },
  { key: 'producer', label: 'Bottler / producer', placeholder: 'e.g. Old Tom Distillery Co., Bardstown, KY' },
  { key: 'countryOfOrigin', label: 'Country of origin (imports)', placeholder: 'e.g. Product of Scotland' },
]

interface Props {
  sample: Sample | null
  onSampleConsumed: () => void
}

export default function CheckTab({ sample, onSampleConsumed }: Props) {
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [imageName, setImageName] = useState('')
  const [app, setApp] = useState<ApplicationData>(EMPTY_APP)
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const acceptFile = useCallback(async (file: File) => {
    setError('')
    setResult(null)
    try {
      const prepared = await prepareImage(file)
      setImage(prepared)
      setImageName(file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }, [])

  const runCheck = useCallback(
    async (img: PreparedImage, data: ApplicationData) => {
      setBusy(true)
      setError('')
      setResult(null)
      const started = performance.now()
      try {
        const response = await verifyImage(img.base64, img.mediaType)
        setResult(verify(data, response.extraction, Math.round(performance.now() - started)))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  // A sample chosen from the Samples tab: load its image, fill the form, run.
  useEffect(() => {
    if (!sample) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(sample.fileUrl)
        const blob = await res.blob()
        const file = new File([blob], sample.file, { type: blob.type || 'image/png' })
        const prepared = await prepareImage(file)
        if (cancelled) return
        setImage(prepared)
        setImageName(sample.file)
        setApp({ ...EMPTY_APP, ...sample.application })
        onSampleConsumed()
        await runCheck(prepared, { ...EMPTY_APP, ...sample.application })
      } catch {
        if (!cancelled) setError('Could not load the sample image.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sample, onSampleConsumed, runCheck])

  const canVerify = image !== null && app.brandName.trim() !== '' && !busy

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-lg font-semibold">1. Add the label image</h2>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a label image"
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) void acceptFile(file)
            }}
            className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-blue-400'
            }`}
          >
            {image ? (
              <div className="space-y-2">
                <img src={image.previewUrl} alt="Label preview" className="mx-auto max-h-72 rounded-lg shadow" />
                <p className="text-sm text-slate-500">{imageName} — click to choose a different image</p>
              </div>
            ) : (
              <>
                <p className="text-4xl" aria-hidden>
                  🏷️
                </p>
                <p className="mt-2 text-lg font-medium">Drop the label image here</p>
                <p className="text-slate-500">or click to choose a file (JPEG or PNG)</p>
              </>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void acceptFile(file)
              e.target.value = ''
            }}
          />
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">2. Enter what the application says</h2>
          <div className="space-y-3">
            {FORM_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block font-medium">
                  {f.label}
                  {!f.required && <span className="ml-1 text-sm font-normal text-slate-400">(optional)</span>}
                </span>
                <input
                  type="text"
                  value={app[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setApp((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
            ))}
          </div>
        </section>

        <button
          type="button"
          disabled={!canVerify}
          onClick={() => image && runCheck(image, app)}
          className="w-full rounded-xl bg-blue-700 px-6 py-4 text-xl font-semibold text-white shadow transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? 'Checking the label…' : 'Check this label'}
        </button>
        {!image && <p className="text-center text-sm text-slate-500">Add a label image to get started.</p>}
        {image && !app.brandName.trim() && (
          <p className="text-center text-sm text-slate-500">Enter at least the brand name from the application.</p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">3. Review the result</h2>
        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900" role="alert">
            <p className="font-semibold">Something went wrong</p>
            <p>{error}</p>
          </div>
        )}
        {busy && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden />
            Reading the label…
          </div>
        )}
        {result && !busy && <ResultCard result={result} />}
        {!result && !busy && !error && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
            The verdict will appear here — green means everything matches, yellow means look closer, red means
            something is wrong.
          </p>
        )}
      </div>
    </div>
  )
}

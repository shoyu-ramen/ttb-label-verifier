import { useEffect, useState } from 'react'
import { loadSamples, type Sample } from '../lib/samples'

const EXPECT_LABEL: Record<Sample['expect'], string> = {
  PASS: 'should pass',
  NEEDS_REVIEW: 'should ask for review',
  FAIL: 'should be flagged',
}

export default function SamplesTab({ onTry }: { onTry: (sample: Sample) => void }) {
  const [samples, setSamples] = useState<Sample[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    loadSamples()
      .then(setSamples)
      .catch(() => setError('Could not load the sample labels.'))
  }, [])

  if (error) return <p className="text-red-800">{error}</p>

  return (
    <div>
      <p className="mb-6 max-w-3xl text-slate-600">
        These test labels are bundled with the app — each one comes with its matching application data already
        filled in. Click one to run a check and see how the tool handles it. They cover the common problems
        agents catch by eye today: altered warnings, wrong ABV, missing fields, and poor photos.
      </p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {samples.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onTry(s)}
            className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <div className="flex h-52 items-center justify-center overflow-hidden bg-slate-100 p-3">
              <img src={s.fileUrl} alt={s.title} className="max-h-full rounded shadow-sm" loading="lazy" />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <p className="font-semibold">{s.title}</p>
              <p className="mt-1 flex-1 text-sm text-slate-600">{s.description}</p>
              <p className="mt-3 text-sm font-semibold text-blue-700 group-hover:underline">
                Try it — {EXPECT_LABEL[s.expect]} →
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

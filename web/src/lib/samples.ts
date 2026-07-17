import type { ApplicationData } from './types'

export interface Sample {
  id: string
  title: string
  file: string
  fileUrl: string
  description: string
  expect: 'PASS' | 'NEEDS_REVIEW' | 'FAIL'
  application: Partial<ApplicationData>
}

export async function loadSamples(): Promise<Sample[]> {
  const base = import.meta.env.BASE_URL
  const res = await fetch(`${base}samples/samples.json`)
  if (!res.ok) throw new Error('Could not load samples.')
  const raw = (await res.json()) as Array<Omit<Sample, 'fileUrl'>>
  return raw.map((s) => ({ ...s, fileUrl: `${base}samples/${s.file}` }))
}

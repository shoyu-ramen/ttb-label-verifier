import { useMemo, useRef, useState } from 'react'
import type { ApplicationData, VerificationResult } from '../lib/types'
import { prepareImage } from '../lib/image'
import { verifyImage } from '../lib/api'
import { verify } from '../lib/compare'
import { parseApplicationCsv, resultsToCsv, CSV_TEMPLATE } from '../lib/csv'
import { OverallBadge } from './StatusBadge'
import ResultCard from './ResultCard'
import { EMPTY_APP } from './CheckTab'

type ItemState = 'queued' | 'running' | 'done' | 'error'

interface BatchItem {
  file: File
  state: ItemState
  result?: VerificationResult
  error?: string
}

const CONCURRENCY = 4

export default function BatchTab() {
  const [items, setItems] = useState<BatchItem[]>([])
  const [appData, setAppData] = useState<Map<string, Partial<ApplicationData>>>(new Map())
  const [csvName, setCsvName] = useState('')
  const [csvError, setCsvError] = useState('')
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const csvInput = useRef<HTMLInputElement>(null)

  const doneCount = items.filter((i) => i.state === 'done' || i.state === 'error').length

  function addImages(files: FileList | File[]) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'))
    setItems((prev) => [
      ...prev,
      ...images
        .filter((f) => !prev.some((p) => p.file.name === f.name))
        .map((file) => ({ file, state: 'queued' as ItemState })),
    ])
    setExpanded(null)
  }

  async function addCsv(file: File) {
    setCsvError('')
    try {
      const map = parseApplicationCsv(await file.text())
      setAppData(map)
      setCsvName(`${file.name} — application data for ${map.size} label${map.size === 1 ? '' : 's'}`)
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Could not read that CSV.')
    }
  }

  async function run() {
    setRunning(true)
    setExpanded(null)
    setItems((prev) => prev.map((i) => (i.state === 'done' ? i : { ...i, state: 'queued', error: undefined })))

    const queue = items.map((_, idx) => idx).filter((idx) => items[idx].state !== 'done')
    const update = (idx: number, patch: Partial<BatchItem>) =>
      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

    async function workOn(idx: number) {
      const item = items[idx]
      update(idx, { state: 'running' })
      const started = performance.now()
      try {
        const prepared = await prepareImage(item.file)
        const response = await verifyImage(prepared.base64, prepared.mediaType)
        const data: ApplicationData = { ...EMPTY_APP, ...(appData.get(item.file.name.toLowerCase()) ?? {}) }
        update(idx, {
          state: 'done',
          result: verify(data, response.extraction, Math.round(performance.now() - started)),
        })
      } catch (err) {
        update(idx, { state: 'error', error: err instanceof Error ? err.message : 'Failed.' })
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const idx = queue.shift()
        if (idx === undefined) break
        await workOn(idx)
      }
    })
    await Promise.all(workers)
    setRunning(false)
  }

  function exportCsv() {
    const csv = resultsToCsv(
      items.map((i) => ({ filename: i.file.name, result: i.result, error: i.error })),
    )
    downloadText(csv, 'label-check-results.csv')
  }

  const summary = useMemo(() => {
    const counts = { PASS: 0, NEEDS_REVIEW: 0, FAIL: 0, ERROR: 0 }
    for (const i of items) {
      if (i.state === 'error') counts.ERROR++
      else if (i.result) counts[i.result.overall]++
    }
    return counts
  }, [items])

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-slate-600">
        For when an importer drops a pile of applications on you at once: add all the label images, and
        optionally a CSV listing what each application says (matched by file name). Labels without CSV data are
        still checked for a compliant government warning and readable required fields.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => imageInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            addImages(e.dataTransfer.files)
          }}
          className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center transition-colors hover:border-blue-400"
        >
          <p className="text-lg font-medium">Add label images</p>
          <p className="text-slate-500">drop them here or click to choose — as many as you need</p>
        </button>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-medium">Application data (optional)</p>
              <p className="text-sm text-slate-500">
                CSV with a <code>filename</code> column.{' '}
                <button
                  type="button"
                  className="text-blue-700 underline"
                  onClick={() => downloadText(CSV_TEMPLATE, 'application-data-template.csv')}
                >
                  Download the template
                </button>
              </p>
            </div>
            <button
              type="button"
              onClick={() => csvInput.current?.click()}
              className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50"
            >
              Choose CSV
            </button>
          </div>
          {csvName && <p className="mt-2 text-sm text-green-800">✓ {csvName}</p>}
          {csvError && <p className="mt-2 text-sm text-red-800">{csvError}</p>}
        </div>
      </div>

      <input
        ref={imageInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addImages(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={csvInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void addCsv(f)
          e.target.value = ''
        }}
      />

      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={running}
              onClick={() => void run()}
              className="rounded-xl bg-blue-700 px-6 py-3 text-lg font-semibold text-white shadow hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {running
                ? `Checking… ${doneCount} of ${items.length}`
                : `Check ${items.length} label${items.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              disabled={running || items.length === 0}
              onClick={() => {
                setItems([])
                setExpanded(null)
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Clear list
            </button>
            {doneCount > 0 && !running && (
              <>
                <span className="text-slate-600">
                  {summary.PASS} passed · {summary.NEEDS_REVIEW} to review · {summary.FAIL} flagged
                  {summary.ERROR > 0 ? ` · ${summary.ERROR} errors` : ''}
                </span>
                <button type="button" onClick={exportCsv} className="font-semibold text-blue-700 underline">
                  Download results (CSV)
                </button>
              </>
            )}
          </div>

          {running && (
            <div className="h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={doneCount} aria-valuemax={items.length}>
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${(doneCount / items.length) * 100}%` }}
              />
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-sm text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-semibold">Label image</th>
                  <th className="px-4 py-2 font-semibold">Result</th>
                  <th className="px-4 py-2 font-semibold">Time</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <RowGroup
                    key={item.file.name}
                    item={item}
                    expanded={expanded === idx}
                    onToggle={() => setExpanded(expanded === idx ? null : idx)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function RowGroup({ item, expanded, onToggle }: { item: BatchItem; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="px-4 py-2.5 font-medium">{item.file.name}</td>
        <td className="px-4 py-2.5">
          {item.state === 'queued' && <span className="text-slate-400">waiting…</span>}
          {item.state === 'running' && (
            <span className="inline-flex items-center gap-2 text-slate-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden />
              checking…
            </span>
          )}
          {item.state === 'done' && item.result && <OverallBadge status={item.result.overall} />}
          {item.state === 'error' && <span className="font-medium text-red-800">{item.error}</span>}
        </td>
        <td className="px-4 py-2.5 text-slate-500">
          {item.result ? `${(item.result.elapsedMs / 1000).toFixed(1)}s` : ''}
        </td>
        <td className="px-4 py-2.5 text-right">
          {item.result && (
            <button type="button" onClick={onToggle} className="font-semibold text-blue-700 underline">
              {expanded ? 'Hide details' : 'Details'}
            </button>
          )}
        </td>
      </tr>
      {expanded && item.result && (
        <tr className="border-t border-slate-100 bg-slate-50/50">
          <td colSpan={4} className="p-4">
            <ResultCard result={item.result} />
          </td>
        </tr>
      )}
    </>
  )
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

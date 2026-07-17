import { useCallback, useState } from 'react'
import CheckTab from './components/CheckTab'
import BatchTab from './components/BatchTab'
import SamplesTab from './components/SamplesTab'
import type { Sample } from './lib/samples'

type Tab = 'check' | 'batch' | 'samples'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'check', label: 'Check a label' },
  { id: 'batch', label: 'Check a batch' },
  { id: 'samples', label: 'Try a sample' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('check')
  const [pendingSample, setPendingSample] = useState<Sample | null>(null)

  const onTrySample = useCallback((sample: Sample) => {
    setPendingSample(sample)
    setTab('check')
  }, [])
  const onSampleConsumed = useCallback(() => setPendingSample(null), [])

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              🏷️ Label Verifier{' '}
              <span className="align-middle rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                PROTOTYPE
              </span>
            </h1>
            <p className="text-sm text-slate-500">
              Checks an alcohol beverage label against its COLA application — including the exact government
              warning.
            </p>
          </div>
          <nav className="flex gap-1 rounded-xl bg-slate-100 p-1" aria-label="Main">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`rounded-lg px-4 py-2 font-semibold transition-colors ${
                  tab === t.id ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {tab === 'check' && <CheckTab sample={pendingSample} onSampleConsumed={onSampleConsumed} />}
        {tab === 'batch' && <BatchTab />}
        {tab === 'samples' && <SamplesTab onTry={onTrySample} />}
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-8 text-sm text-slate-400">
        Prototype for evaluation only — no images or data are stored. Every verdict should be confirmed by a
        compliance agent.
      </footer>
    </div>
  )
}

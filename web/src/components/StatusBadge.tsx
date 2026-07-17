import type { FieldStatus, OverallStatus } from '../lib/types'

const OVERALL_STYLES: Record<OverallStatus, { classes: string; text: string; icon: string }> = {
  PASS: { classes: 'bg-green-100 text-green-900 border-green-300', text: 'Looks good', icon: '✓' },
  NEEDS_REVIEW: { classes: 'bg-amber-100 text-amber-900 border-amber-300', text: 'Needs your review', icon: '?' },
  FAIL: { classes: 'bg-red-100 text-red-900 border-red-300', text: 'Problems found', icon: '✕' },
}

export function OverallBadge({ status, big = false }: { status: OverallStatus; big?: boolean }) {
  const s = OVERALL_STYLES[status]
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border font-semibold ${s.classes} ${
        big ? 'px-5 py-2 text-xl' : 'px-3 py-0.5 text-sm'
      }`}
    >
      <span aria-hidden>{s.icon}</span>
      {s.text}
    </span>
  )
}

const FIELD_STYLES: Record<FieldStatus, { classes: string; text: string; icon: string }> = {
  EXACT: { classes: 'text-green-800', text: 'Match', icon: '✓' },
  MATCH: { classes: 'text-green-800', text: 'Match*', icon: '✓' },
  MISMATCH: { classes: 'text-red-800', text: 'Mismatch', icon: '✕' },
  NOT_ON_LABEL: { classes: 'text-red-800', text: 'Missing', icon: '✕' },
  NEEDS_REVIEW: { classes: 'text-amber-800', text: 'Check by eye', icon: '?' },
  NOT_CHECKED: { classes: 'text-slate-500', text: 'Skipped', icon: '–' },
}

export function FieldBadge({ status }: { status: FieldStatus }) {
  const s = FIELD_STYLES[status]
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold whitespace-nowrap ${s.classes}`}>
      <span aria-hidden>{s.icon}</span>
      {s.text}
    </span>
  )
}

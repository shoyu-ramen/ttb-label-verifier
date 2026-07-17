import type { VerificationResult } from '../lib/types'
import { OverallBadge, FieldBadge } from './StatusBadge'

/** Full verification result: overall verdict, warning check, field table. */
export default function ResultCard({ result }: { result: VerificationResult }) {
  const warningTone =
    result.warning.status === 'PASS'
      ? 'border-green-300 bg-green-50'
      : result.warning.status === 'FAIL'
        ? 'border-red-300 bg-red-50'
        : 'border-amber-300 bg-amber-50'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <OverallBadge status={result.overall} big />
        <span className="text-slate-500">
          checked in {(result.elapsedMs / 1000).toFixed(1)} seconds
        </span>
      </div>

      {result.imageIssues.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">Image quality</p>
          <ul className="mt-1 list-disc pl-5">
            {result.imageIssues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={`rounded-xl border p-4 ${warningTone}`}>
        <p className="font-semibold">
          Government warning statement{' '}
          {result.warning.status === 'PASS'
            ? '— exactly as required ✓'
            : result.warning.status === 'FAIL'
              ? '— not compliant ✕'
              : '— please confirm by eye'}
        </p>
        {result.warning.problems.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {result.warning.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {result.warning.found && result.warning.status !== 'PASS' && (
          <p className="mt-2 text-sm text-slate-600">
            The label reads: <span className="italic">“{result.warning.found}”</span>
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-sm text-slate-600">
            <tr>
              <th className="px-4 py-2 font-semibold">Field</th>
              <th className="px-4 py-2 font-semibold">Application says</th>
              <th className="px-4 py-2 font-semibold">Label says</th>
              <th className="px-4 py-2 font-semibold">Result</th>
            </tr>
          </thead>
          <tbody>
            {result.fields.map((f) => (
              <tr key={f.field} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2.5 font-medium">{f.label}</td>
                <td className="px-4 py-2.5">{f.expected || <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-2.5">{f.found ?? <span className="text-slate-400">not found</span>}</td>
                <td className="px-4 py-2.5">
                  <FieldBadge status={f.status} />
                  {f.status !== 'EXACT' && f.status !== 'NOT_CHECKED' && (
                    <p className="mt-0.5 max-w-72 text-sm text-slate-600">{f.note}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

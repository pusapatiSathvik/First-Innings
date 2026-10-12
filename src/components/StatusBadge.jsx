const tones = { registration_open: 'bg-lime/10 text-lime', registration_closed: 'bg-amber-200/10 text-amber-200', draft: 'bg-white/10 text-slate-300', waiting: 'bg-white/10 text-slate-400', scheduled: 'bg-sky-300/10 text-sky-200', bye: 'bg-lime/10 text-lime', abandoned: 'bg-amber-200/10 text-amber-200', pending: 'bg-amber-200/10 text-amber-200', approved: 'bg-lime/10 text-lime', rejected: 'bg-rose-300/10 text-rose-200', withdrawn: 'bg-white/10 text-muted', active: 'bg-lime/10 text-lime', cancelled: 'bg-rose-300/10 text-rose-200', ready: 'bg-sky-300/10 text-sky-200', live: 'bg-rose-300/10 text-rose-200', completed: 'bg-white/10 text-slate-300' }

export function StatusBadge({ status }) {
  const label = (status || 'unknown').replaceAll('_', ' ')
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide ${tones[status] || 'bg-white/10 text-slate-300'}`}>{label}</span>
}

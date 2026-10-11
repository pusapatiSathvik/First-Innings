export function Feedback({ error, message, className = '' }) {
  if (!error && !message) return null
  return <div className={`mb-5 rounded-xl border px-4 py-3 text-sm leading-6 ${error ? 'border-rose-300/20 bg-rose-400/10 text-rose-200' : 'border-lime/20 bg-lime/10 text-lime'} ${className}`} role={error ? 'alert' : 'status'}>{error || message}</div>
}

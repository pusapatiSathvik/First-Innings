import { Shield } from 'lucide-react'

export function Brand({ compact = false }) {
  return <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-lime text-ink"><Shield size={21} strokeWidth={2.5} /></div><div><div className="font-extrabold tracking-tight text-white">CRICKET <span className="text-lime">IN BOX</span></div>{!compact && <div className="text-[10px] font-bold uppercase tracking-[.22em] text-muted">Tournament control</div>}</div></div>
}

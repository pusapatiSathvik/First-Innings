import { ArrowLeft, ClipboardList, Shield, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from './Brand'

export function StageLayout({ children, title, description, admin = false }) {
  return <div className="min-h-screen bg-ink text-white">
    <header className="border-b border-white/10"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8"><Link to="/dashboard"><Brand compact /></Link><nav className="flex items-center gap-2"><Link to="/tournaments" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white"><ClipboardList className="mr-1 inline" size={16}/> Tournaments</Link><Link to="/teams" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white"><Users className="mr-1 inline" size={16}/> My teams</Link>{admin&&<Link to="/admin" className="rounded-lg px-3 py-2 text-sm font-semibold text-lime hover:bg-white/5"><Shield className="mr-1 inline" size={16}/> Admin</Link>}</nav></div></header>
    <main className="mx-auto max-w-6xl px-5 py-9 sm:px-8"><Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-white"><ArrowLeft size={15}/> Dashboard</Link><div className="mb-8 mt-6"><h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p></div>{children}</main>
  </div>
}

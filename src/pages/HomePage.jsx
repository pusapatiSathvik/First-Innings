import { ArrowDownRight, ArrowRight, CalendarDays, CircleDot, ShieldCheck, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'

const features = [
  { icon: Trophy, title: 'Built for the bracket', copy: 'Keep every team, fixture, and result in one place as the tournament takes shape.' },
  { icon: CircleDot, title: 'Every ball counts', copy: 'Give match officials a focused scoring workspace made for the boundary line.' },
  { icon: ShieldCheck, title: 'Fair play, by design', copy: 'Clear roles and database-enforced permissions protect every official decision.' },
]

function MatchPreview() {
  return <div className="relative mx-auto w-full max-w-lg">
    <div className="absolute inset-4 rounded-[2rem] bg-lime/20 blur-3xl" />
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#102923] p-6 shadow-2xl shadow-black/40 sm:p-8">
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full border border-lime/15" />
      <div className="absolute -right-2 -top-2 h-32 w-32 rounded-full border border-lime/20" />
      <div className="relative"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-lime"><ShieldCheck size={15}/> One place for matchday</div>
        <div className="mt-10 grid grid-cols-2 gap-3">
          {[['01', 'Set the season'], ['02', 'Bring teams together'], ['03', 'Keep decisions clear'], ['04', 'Record every result']].map(([number, label]) => <div key={number} className="rounded-2xl border border-white/10 bg-black/15 p-4"><span className="font-mono text-xs text-lime">{number}</span><div className="mt-3 text-sm font-extrabold">{label}</div></div>)}
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-lime p-4 text-ink"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-lime"><CircleDot size={20}/></div><div><div className="font-black">Made for the whole tournament</div><div className="mt-0.5 text-xs font-medium text-ink/70">From team sign-up through the final ball</div></div></div>
      </div>
    </div>
  </div>
}

export function HomePage() {
  return <div className="min-h-screen overflow-hidden bg-ink text-white">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8"><Brand /><nav className="flex items-center gap-2 sm:gap-3"><Link className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:text-white" to="/tournaments">Tournaments</Link><Link className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-slate-200 hover:text-white sm:block" to="/login">Log in</Link><Link className="rounded-lg bg-lime px-4 py-2.5 text-sm font-extrabold text-ink transition hover:bg-white" to="/register">Get started <ArrowRight className="ml-1 inline" size={16} /></Link></nav></header>
    <main>
      <section className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.08fr_.92fr] lg:pb-32">
        <div className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-lime/10 blur-[110px]" />
        <div className="relative z-10"><div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-lime"><span className="h-2 w-2 rounded-full bg-lime" /> Your tournament. Under control.</div><h1 className="max-w-3xl text-5xl font-black leading-[.98] tracking-[-.055em] sm:text-7xl">The game is on.<br /><span className="text-lime">Keep it moving.</span></h1><p className="mt-7 max-w-lg text-lg leading-8 text-slate-300">One calm place to run your cricket tournament—from the first team sign-up to the final ball.</p><div className="mt-9 flex flex-wrap items-center gap-4"><Link to="/register" className="rounded-xl bg-lime px-6 py-4 font-extrabold text-ink shadow-lg shadow-lime/10 transition hover:-translate-y-0.5 hover:bg-white">Start your tournament <ArrowRight className="ml-2 inline" size={17} /></Link><Link to="/login" className="px-3 py-3 font-bold text-slate-200 hover:text-lime">I already have an account <ArrowDownRight className="ml-1 inline" size={16} /></Link></div><div className="mt-12 flex items-center gap-3 text-sm text-muted"><CalendarDays size={17} className="text-lime" /> Simple setup. Clear roles. Every score in its place.</div></div>
        <MatchPreview />
      </section>
      <section className="border-t border-white/10 bg-[#0b211e]"><div className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-8 md:grid-cols-3">{features.map(({ icon: _Icon, title, copy }, i) => <article key={title} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-6"><div className="flex items-center justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-lime/10 text-lime"><_Icon size={21} /></div><span className="font-mono text-xs text-muted">0{i + 1}</span></div><h2 className="mt-6 text-lg font-extrabold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{copy}</p></article>)}</div></section>
    </main>
    <footer className="mx-auto flex max-w-7xl justify-between px-5 py-7 text-xs text-muted sm:px-8"><Brand compact /><span>Made for the love of the game.</span></footer>
  </div>
}

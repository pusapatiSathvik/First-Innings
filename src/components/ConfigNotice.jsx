import { CircleAlert } from 'lucide-react'

export function ConfigNotice() {
  return <div role="status" className="flex gap-3 rounded-xl border border-amber-200/20 bg-amber-100/5 p-4 text-sm text-amber-100"><CircleAlert className="mt-0.5 shrink-0" size={18} /><p><strong>Supabase isn’t configured yet.</strong> Add your project URL and publishable key to <code className="rounded bg-black/20 px-1">.env</code>, then restart the dev server to enable authentication.</p></div>
}

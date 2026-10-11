import { cva } from 'class-variance-authority'

export const buttonVariants = cva('inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-bold ring-offset-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: { default: 'bg-lime text-ink hover:bg-white', outline: 'border border-white/10 bg-transparent text-white hover:bg-white/5', ghost: 'text-white hover:bg-white/5' },
    size: { default: 'h-12 px-5 py-3', sm: 'h-9 px-3', lg: 'h-14 px-6 text-base', icon: 'h-10 w-10' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

import { forwardRef } from 'react'
import { buttonVariants } from './button-variants'
import { cn } from '../../lib/utils'

export const Button = forwardRef(function Button({ className, variant, size, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})


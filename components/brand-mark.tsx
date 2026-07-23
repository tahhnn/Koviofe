import Link from 'next/link'
import { cn } from '@/lib/utils'

export function BrandMark({
  href = '/',
  className,
  size = 'md',
}: {
  href?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const text =
    size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-xl'

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-baseline gap-0.5 font-semibold tracking-tight text-[#f2f0eb] hover:opacity-90 transition-opacity',
        text,
        className
      )}
    >
      <span>Kovio</span>
      <span className="text-[#e85d4c]" aria-hidden>
        .
      </span>
    </Link>
  )
}

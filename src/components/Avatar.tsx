/**
 * Deterministic avatar: a given person always gets the same gradient,
 * derived from their id. It avoids a sea of identical bubbles without asking
 * anyone to upload a picture.
 */

const GRADIENTS = [
  'from-brand-500 to-brand-700',
  'from-fuchsia-500 to-brand-600',
  'from-violet-500 to-indigo-600',
  'from-brand-400 to-pink-600',
  'from-sky-500 to-brand-600',
  'from-emerald-500 to-brand-600',
  'from-amber-500 to-brand-600',
  'from-rose-500 to-brand-700',
] as const

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
} as const

function hash(value: string) {
  let total = 0
  for (let i = 0; i < value.length; i += 1) {
    total = (total * 31 + value.charCodeAt(i)) >>> 0
  }
  return total
}

export function Avatar({
  userId,
  username,
  size = 'md',
  className = '',
}: {
  userId: string
  username: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const gradient = GRADIENTS[hash(userId) % GRADIENTS.length]

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm ${gradient} ${SIZES[size]} ${className}`}
    >
      {username.charAt(0).toUpperCase()}
    </span>
  )
}

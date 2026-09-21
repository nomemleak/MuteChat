/** Formats a Supabase error so it is readable in the console without expanding it. */
export function describeSupabaseError(error: {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}) {
  return [
    error.code ? `code=${error.code}` : null,
    error.message ? `message=${error.message}` : null,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null,
  ]
    .filter(Boolean)
    .join(' | ')
}

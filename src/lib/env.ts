/**
 * Environment variables, validated when the module loads.
 *
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` when it is written out
 * literally: do not replace these accesses with a dynamic lookup.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. ` +
        'Copy `.env.example` to `.env.local` and fill it in.',
    )
  }
  return value
}

export const SUPABASE_URL = required(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
)

export const SUPABASE_ANON_KEY = required(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

/**
 * Domain of the placeholder emails generated for anonymous accounts.
 * Supabase Auth requires an email; this one is never shown or used.
 */
export const ANONYMOUS_EMAIL_DOMAIN = 'mutechat.app'

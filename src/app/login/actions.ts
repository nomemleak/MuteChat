'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ANONYMOUS_EMAIL_DOMAIN } from '@/lib/env'
import { createClient } from '@/utils/supabase/server'

export type AuthResult = { error: string } | undefined

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,20}$/
const MIN_PASSWORD_LENGTH = 8

/**
 * Supabase Auth requires an email. To keep accounts anonymous, one is derived
 * from the username. It is never shown, nor used to contact the user.
 * Accepted trade-off: there is no "forgot password".
 */
function emailFromUsername(username: string) {
  return `${username.toLowerCase()}@${ANONYMOUS_EMAIL_DOMAIN}`
}

function readCredentials(formData: FormData) {
  const username = String(formData.get('username') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  return { username, password }
}

export async function loginAnonymous(formData: FormData): Promise<AuthResult> {
  const { username, password } = readCredentials(formData)

  if (!username || !password) {
    return { error: 'Please fill in every field.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: emailFromUsername(username),
    password,
  })

  if (error) {
    // Deliberately vague: never reveal which usernames exist.
    return { error: 'Wrong username or password.' }
  }

  revalidatePath('/', 'layout')
  redirect('/chat')
}

export async function signupAnonymous(formData: FormData): Promise<AuthResult> {
  const { username, password } = readCredentials(formData)

  if (!username || !password) {
    return { error: 'Please fill in every field.' }
  }

  if (!USERNAME_PATTERN.test(username)) {
    return {
      error:
        'Usernames are 3 to 20 characters long (letters, numbers, . _ -), with no spaces.',
    }
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Your password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
    }
  }

  const supabase = await createClient()

  // The public profile is created by the `handle_new_user` SQL trigger, which
  // reads the username from the metadata. Do not insert it here: doing so
  // caused a primary key violation and a "profile creation" error.
  const { data, error } = await supabase.auth.signUp({
    email: emailFromUsername(username),
    password,
    options: { data: { username } },
  })

  if (error) {
    if (/already registered|already exists|User already/i.test(error.message)) {
      return { error: 'This username is already taken.' }
    }
    return { error: "We couldn't create your account. Please try again later." }
  }

  if (!data.session) {
    // Happens when "Confirm email" is enabled in Supabase
    // (Authentication → Providers → Email). The emails are placeholders, so
    // the confirmation link can never be received: turn that option off.
    return {
      error: "Your account was created but couldn't be activated. Please try again later.",
    }
  }

  revalidatePath('/', 'layout')
  redirect('/chat')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

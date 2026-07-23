'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GameBackground } from '@/components/game-background'
import { BrandMark } from '@/components/brand-mark'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = isSignUp
      ? await authClient.signUp.email({ email, nickname: name })
      : await authClient.signIn.email({ email, password })

    setLoading(false)

    if (result.error) {
      setError(result.error.message ?? 'Something went wrong')
      return
    }

    if (isSignUp) {
      router.push(`/sign-up/verify?email=${encodeURIComponent(email)}`)
      return
    }

    router.push('/')
    router.refresh()
  }

  const fieldClass =
    'h-11 bg-[#12141a] border-[#2c313d] focus-visible:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] rounded-xl'

  return (
    <GameBackground variant="auth">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-8">
          <div className="mb-8 text-center space-y-2">
            <BrandMark />
            <h1 className="text-2xl font-semibold text-[#f2f0eb] pt-2">
              {isSignUp ? 'Create an account' : 'Sign in'}
            </h1>
            <p className="text-sm text-[#9a9eab]">
              {isSignUp
                ? 'Build quizzes and run live rooms.'
                : 'Open your dashboard and active rooms.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isSignUp && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="name" className="text-sm text-[#c5c2ba]">
                  Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Alex"
                  className={fieldClass}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-sm text-[#c5c2ba]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@email.com"
                className={fieldClass}
              />
            </div>

            {!isSignUp && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-sm text-[#c5c2ba]">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={fieldClass}
                />
              </div>
            )}

            {error && (
              <div
                className="rounded-xl border border-[#ef4444]/25 bg-[#ef4444]/10 px-3.5 py-3 text-sm text-[#fca5a5]"
                role="alert"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-1 bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-semibold rounded-xl"
            >
              {loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <p className="text-sm text-[#9a9eab] text-center mt-8 pt-6 border-t border-[#2c313d]">
            {isSignUp ? 'Already have an account? ' : 'Need an account? '}
            <Link
              href={isSignUp ? '/sign-in' : '/sign-up'}
              className="text-[#e85d4c] font-medium hover:underline"
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </Link>
          </p>
        </div>
      </div>
    </GameBackground>
  )
}

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { GameBackground } from '@/components/game-background'

function VerifyOTPContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const emailParam = searchParams.get('email') || ''

  const [email, setEmail] = useState(emailParam)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam)
    }
  }, [emailParam])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await authClient.verifyOTP({ email, otp })

    setLoading(false)

    if (result.error) {
      setError(result.error.message ?? 'Verification failed')
      return
    }

    setVerified(true)
  }

  if (verified) {
    return (
      <GameBackground variant="auth">
        <div className="flex-1 flex items-center justify-center px-4">
          <Card className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden text-center">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-green-500/40 via-emerald-500/40 to-teal-500/40"></div>

            <div className="mb-6">
              <span className="text-4xl">🎉</span>
              <h1 className="text-2xl font-black text-white mt-4">Verification Successful!</h1>
              <p className="text-sm text-gray-400 mt-2">
                Your account has been created. A temporary password was sent to{' '}
                <span className="text-white font-medium">{email}</span>. Check your inbox, then sign in and change your password.
              </p>
            </div>

            <Button
              onClick={() => {
                router.push('/sign-in')
                router.refresh()
              }}
              className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold rounded-xl shadow-[0_4px_15px_rgba(16,185,129,0.2)] transform hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-none"
            >
              Go to Sign In
            </Button>
          </Card>
        </div>
      </GameBackground>
    )
  }

  return (
    <GameBackground variant="auth">
      <div className="flex-1 flex items-center justify-center px-4">
        <Card className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-purple-500/40 via-indigo-500/40 to-blue-500/40"></div>
          
          <div className="mb-8 text-center">
            <Link href="/" className="inline-block mb-4">
              <span className="text-xl font-black tracking-wider bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
                ⚔️ QUIZBATTLE
              </span>
            </Link>
            <h1 className="text-2xl font-black text-white">
              Verify Your Email
            </h1>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
              We have sent a 6-digit verification code to {email || 'your email'}.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-gray-400">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@email.com"
                className="bg-black/40 border-white/5 focus:border-indigo-500/50 text-white placeholder-gray-600 h-12 rounded-xl transition-all duration-300"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="otp" className="text-xs font-bold uppercase tracking-wider text-gray-400">Verification Code</Label>
              <Input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                placeholder="e.g. 123456"
                className="bg-black/40 border-white/5 focus:border-indigo-500/50 text-white placeholder-gray-600 h-12 rounded-xl transition-all duration-300 text-center tracking-widest text-lg font-bold"
                maxLength={6}
              />
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-300 text-xs font-semibold leading-relaxed" role="alert">
                ⚠️ {error}
              </div>
            )}

            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold rounded-xl shadow-[0_4px_15px_rgba(147,51,234,0.2)] hover:shadow-[0_4px_20px_rgba(147,51,234,0.3)] transform hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-none"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Verifying...
                </span>
              ) : (
                'Verify & Create Account'
              )}
            </Button>
          </form>

          <div className="text-sm text-gray-400 text-center mt-8 pt-6 border-t border-white/5">
            Back to{' '}
            <Link
              href="/sign-up"
              className="text-indigo-400 font-extrabold hover:text-indigo-300 transition-colors underline-offset-4 hover:underline"
            >
              Sign Up
            </Link>
          </div>
        </Card>
      </div>
    </GameBackground>
  )
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={
      <GameBackground variant="auth">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </GameBackground>
    }>
      <VerifyOTPContent />
    </Suspense>
  )
}

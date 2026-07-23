'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function QuickJoinForm() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pin.trim()) return
    setLoading(true)
    router.push(`/join?pin=${pin.trim()}`)
  }

  return (
    <form
      onSubmit={handleJoin}
      className="w-full max-w-md rounded-2xl border border-[#2c313d] bg-[#1a1d26]/90 p-7 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.65)]"
    >
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-[#f2f0eb]">Enter a game PIN</h3>
        <p className="text-sm text-[#9a9eab] mt-1.5">Six digits from your host or invite link.</p>
      </div>

      <div className="flex flex-col gap-3">
        <Input
          type="text"
          inputMode="numeric"
          placeholder="123456"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="h-14 bg-[#12141a] border-[#2c313d] focus-visible:border-[#e85d4c] focus-visible:ring-[#e85d4c]/30 text-[#f2f0eb] placeholder:text-[#5c6170] text-center text-2xl font-semibold tracking-[0.35em] rounded-xl"
          maxLength={6}
          required
          aria-label="Game PIN"
        />
        <Button
          type="submit"
          disabled={loading || pin.length < 6}
          className="h-12 w-full bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-semibold rounded-xl active:scale-[0.98] disabled:opacity-40"
        >
          {loading ? 'Opening…' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}

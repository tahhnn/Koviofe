'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { QRCodeComponent } from '@/components/qr-code'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { getGameSession } from '@/app/actions/quizzes'

export default function QRPage() {
  const params = useParams()
  const sessionId = params.sessionId as string
  const [pinCode, setPinCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const session = await getGameSession(sessionId)
        if (!active) return
        if (!session.sessionCode) {
          setError('PIN code not found for this room')
          return
        }
        setPinCode(String(session.sessionCode))
      } catch (e: unknown) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Failed to load room PIN')
      }
    })()
    return () => {
      active = false
    }
  }, [sessionId])

  const joinUrl =
    typeof window !== 'undefined' && pinCode
      ? `${window.location.origin}/join?pin=${pinCode}`
      : ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-card/50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-card border border-secondary/30 rounded-3xl p-12 text-center space-y-8">
          <div>
            <h1 className="text-5xl font-bold text-foreground mb-2">Join the Game!</h1>
            <p className="text-muted-foreground text-lg">Scan this QR code with your phone</p>
          </div>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          {!pinCode && !error && (
            <p className="text-muted-foreground">Loading PIN…</p>
          )}

          {pinCode && (
            <>
              <div className="flex justify-center bg-white p-8 rounded-2xl">
                <QRCodeComponent value={joinUrl} size={300} />
              </div>

              <div className="space-y-2">
                <p className="text-muted-foreground text-sm">Or enter this code manually:</p>
                <div className="bg-background border-2 border-accent rounded-xl p-6">
                  <p className="text-6xl font-bold text-accent tracking-widest">{pinCode}</p>
                </div>
                <p className="text-xs text-muted-foreground">Go to /join and enter the PIN above</p>
              </div>

              <div className="bg-primary/10 border border-primary/30 rounded-xl p-6 text-left space-y-3">
                <h3 className="font-semibold text-foreground">How to join:</h3>
                <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Open /join on your phone</li>
                  <li>Scan this QR code or enter PIN: {pinCode}</li>
                  <li>Enter your name</li>
                  <li>Click Join and start playing!</li>
                </ol>
              </div>
            </>
          )}

          <div className="flex gap-4 justify-center flex-wrap">
            <Link href={`/host/${sessionId}`}>
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-white">
                Back to Host Control
              </Button>
            </Link>
            {pinCode && (
              <Button
                onClick={() => {
                  const canvas = document.querySelector('img')
                  if (canvas) {
                    const link = document.createElement('a')
                    link.href = canvas.src
                    link.download = `quiz-qr-${pinCode}.png`
                    link.click()
                  }
                }}
                size="lg"
                variant="outline"
                className="border-secondary text-secondary"
              >
                Download QR Code
              </Button>
            )}
          </div>
        </div>

        <div className="mt-8 text-center text-muted-foreground text-sm">
          <p>Display this screen on a projector or screen for easy access</p>
        </div>
      </div>
    </div>
  )
}

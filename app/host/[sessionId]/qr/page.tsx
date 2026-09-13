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
    <div className="min-h-[100dvh] bg-gradient-to-br from-background via-background to-card/50 flex items-start md:items-center justify-center overflow-y-auto p-4 py-6">
      <div className="max-w-2xl xl:max-w-4xl w-full">
        <div className="bg-card border border-secondary/30 rounded-3xl p-5 sm:p-8 md:p-12 text-center space-y-8">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold text-foreground mb-2">Join the Game!</h1>
            <p className="text-muted-foreground text-base md:text-xl">Scan this QR code with your phone</p>
          </div>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          {!pinCode && !error && (
            <p className="text-muted-foreground">Loading PIN…</p>
          )}

          {pinCode && (
            <>
              <div className="flex justify-center rounded-2xl">
                <QRCodeComponent value={joinUrl} size={640} className="w-[min(70vw,560px)]" />
              </div>

              <div className="space-y-2">
                <p className="text-muted-foreground text-sm">Or enter this code manually:</p>
                <div className="bg-background border-2 border-accent rounded-xl p-4 sm:p-6">
                  <p className="text-4xl sm:text-6xl md:text-7xl xl:text-8xl 2xl:text-9xl font-bold text-accent tracking-[0.15em] break-all leading-none">{pinCode}</p>
                </div>
                <p className="text-xs text-muted-foreground">Go to /join and enter the PIN above</p>
              </div>

              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 sm:p-6 text-left space-y-3">
                <h3 className="font-semibold text-foreground">How to join:</h3>
                <ol className="space-y-2 text-sm xl:text-lg text-muted-foreground list-decimal list-inside">
                  <li>Open /join on your phone</li>
                  <li>Scan this QR code or enter PIN: {pinCode}</li>
                  <li>Enter your name</li>
                  <li>Click Join and start playing!</li>
                </ol>
              </div>
            </>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={`/host/${sessionId}`}>
              <Button size="lg" className="h-12 w-full sm:w-auto bg-primary hover:bg-primary/90 text-white">
                Back to Host Control
              </Button>
            </Link>
            {pinCode && (
              <Button
                onClick={() => {
                  const canvas = document.querySelector('img[alt="QR Code"]') as HTMLImageElement | null
                  if (canvas) {
                    const link = document.createElement('a')
                    link.href = canvas.src
                    link.download = `quiz-qr-${pinCode}.png`
                    link.click()
                  }
                }}
                size="lg"
                variant="outline"
                className="h-12 w-full sm:w-auto border-secondary text-secondary"
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

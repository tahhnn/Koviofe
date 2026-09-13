'use client'

import { useEffect, useState } from 'react'
import { generateQRCode } from '@/lib/qr-code'
import { cn } from '@/lib/utils'

interface QRCodeComponentProps {
  value: string
  size?: number
  className?: string
}

export function QRCodeComponent({ value, size = 200, className }: QRCodeComponentProps) {
  const [qrCode, setQrCode] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const generateCode = async () => {
      try {
        const code = await generateQRCode(value)
        setQrCode(code)
      } catch (err) {
        setError('Failed to generate QR code')
      } finally {
        setLoading(false)
      }
    }

    generateCode()
  }, [value])

  if (loading) {
    return (
      <div
        className={cn('flex items-center justify-center aspect-square w-full', className)}
        style={{ maxWidth: size }}
      >
        <div className="text-muted-foreground">Generating...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={cn('flex items-center justify-center aspect-square w-full', className)}
        style={{ maxWidth: size }}
      >
        <div className="text-destructive text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center justify-center bg-white p-3 sm:p-4 rounded-lg', className)}>
      <img src={qrCode} alt="QR Code" className="w-full h-auto" style={{ maxWidth: size }} />
    </div>
  )
}

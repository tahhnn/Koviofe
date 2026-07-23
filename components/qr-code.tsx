'use client'

import { useEffect, useState } from 'react'
import { generateQRCode } from '@/lib/qr-code'

interface QRCodeComponentProps {
  value: string
  size?: number
}

export function QRCodeComponent({ value, size = 200 }: QRCodeComponentProps) {
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
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="text-muted-foreground">Generating...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="text-destructive text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center bg-white p-4 rounded-lg">
      <img src={qrCode} alt="QR Code" style={{ width: size, height: size }} />
    </div>
  )
}

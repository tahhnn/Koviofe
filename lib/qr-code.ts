import QRCode from 'qrcode'

export async function generateQRCode(text: string): Promise<string> {
  try {
    const qrDataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 1,
      width: 300,
    })
    return qrDataUrl
  } catch (error) {
    console.error('Error generating QR code:', error)
    throw error
  }
}

export async function generateQRCodeSVG(text: string): Promise<string> {
  try {
    const svg = await QRCode.toString(text, {
      errorCorrectionLevel: 'H',
      type: 'svg',
      margin: 1,
      width: 300,
    })
    return svg
  } catch (error) {
    console.error('Error generating QR code SVG:', error)
    throw error
  }
}

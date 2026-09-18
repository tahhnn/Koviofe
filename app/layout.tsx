import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Lexend } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { ToastProvider } from '@/components/ui/toast'
import './globals.css'

const lexend = Lexend({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-lexend',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'quizzZone - Live quiz rooms',
  description: 'Host live quizzes with PIN join, realtime scoring, and private or open rooms.',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: [{ color: '#12141a' }],
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Resolved per request from the NEXT_LOCALE cookie, falling back to
  // Accept-Language (see i18n/request.ts). Also drives <html lang>, which
  // screen readers and the browser's own translate prompt read.
  const locale = await getLocale()

  return (
    <html lang={locale} className={`${lexend.variable} dark bg-background`} suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground" suppressHydrationWarning>
        <NextIntlClientProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </NextIntlClientProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

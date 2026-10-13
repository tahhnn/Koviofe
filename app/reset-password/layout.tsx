import type { Metadata } from 'next'

// The reset token rides in the URL fragment, which browsers already keep out of
// Referer; no-referrer is belt and braces for the page that handles it.
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}

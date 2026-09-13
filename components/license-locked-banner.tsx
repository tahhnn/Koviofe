'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { LicenseRedeem } from '@/components/license-redeem'

/**
 * Shown when the account resolves to zero entitlements. Without it the host only
 * ever sees a bare 403 from whichever action they tried first, with no way to
 * tell "you have not activated" apart from "this is broken".
 */
export function LicenseLockedBanner({ onRedeemed }: { onRedeemed?: () => void }) {
  return (
    <div className="rounded-xl border border-[#e85d4c]/40 bg-[#e85d4c]/10 p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Lock className="w-5 h-5 text-[#e85d4c] mt-0.5 shrink-0" />
        <div className="space-y-1">
          <h3 className="font-semibold text-[#f2f0eb]">Tài khoản chưa kích hoạt</h3>
          <p className="text-sm text-[#9a9eab]">
            Bạn chưa thể tạo quiz hoặc mở phòng chơi. Nhập mã kích hoạt đã mua, hoặc liên hệ
            quản trị viên để được cấp gói.
          </p>
        </div>
      </div>

      <LicenseRedeem onRedeemed={onRedeemed} />

      <p className="text-xs text-[#9a9eab]">
        Xem chi tiết gói và hạn dùng tại{' '}
        <Link href="/profile/settings" className="underline hover:text-[#f2f0eb]">
          Cài đặt tài khoản
        </Link>
        .
      </p>
    </div>
  )
}

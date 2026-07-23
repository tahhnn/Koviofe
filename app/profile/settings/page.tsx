'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { GameBackground } from '@/components/game-background'
import {
  getMyLicense,
  listPricingPlans,
  type LicenseSnapshot,
  type PricingPlan,
} from '@/app/actions/license'

function formatLimit(n: number) {
  return n < 0 ? 'Unlimited' : String(n)
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const unlimited = max < 0
  const pct = unlimited ? 5 : Math.min(100, Math.round((used / Math.max(max, 1)) * 100))
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-[#9a9eab]">
        <span>{label}</span>
        <span className="font-mono text-[#f2f0eb]/80">
          {used} / {formatLimit(max)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-black/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#e85d4c] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function ProfileSettingsPage() {
  const router = useRouter()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [license, setLicense] = useState<LicenseSnapshot | null>(null)
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [planLoading, setPlanLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    ;(async () => {
      setPlanLoading(true)
      const session = await authClient.getSession()
      setIsAdmin(session?.user?.role === 'admin')
      const [me, catalog] = await Promise.all([getMyLicense(), listPricingPlans()])
      setLicense(me)
      setPlans(catalog)
      setPlanLoading(false)
    })()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    setLoading(true)
    const result = await authClient.changePassword({ oldPassword, newPassword })
    setLoading(false)

    if (result.error) {
      setError(result.error.message ?? 'Failed to change password')
      return
    }

    setSuccess('Password changed successfully!')
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const ents = license?.entitlements
  const usage = license?.usage

  return (
    <GameBackground variant="auth">
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-3xl space-y-6">
          <Card className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-[#e85d4c]/50" />
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-black text-[#f2f0eb]">Gói đăng ký</h1>
                <p className="text-sm text-[#9a9eab] mt-1">
                  Xem giới hạn và quyền lợi hiện tại. Nâng cấp do admin cấp phép.
                </p>
              </div>
              {ents && (
                <div className="px-4 py-2 rounded-2xl bg-black/40 border border-white/10 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-[#9a9eab]">Current plan</div>
                  <div className="text-lg font-black text-[#e85d4c]">{ents.plan_name}</div>
                  <div className="text-xs text-[#9a9eab] mt-0.5">
                    Max {ents.max_players_per_room} players / room
                  </div>
                </div>
              )}
            </div>

            {planLoading && <p className="text-sm text-[#9a9eab]">Đang tải gói…</p>}

            {!planLoading && ents && usage && (
              <div className="space-y-4 mb-8">
                <UsageBar label="Quizzes" used={usage.quizzes} max={ents.max_quizzes} />
                <UsageBar
                  label="Phòng đang mở (waiting/active)"
                  used={usage.concurrent_rooms}
                  max={ents.max_concurrent_rooms}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs text-[#c5c2ba]">
                  <div className="rounded-xl bg-black/30 border border-white/5 p-3">
                    Câu hỏi / quiz: <strong className="text-[#f2f0eb]">{ents.max_questions_per_quiz}</strong>
                  </div>
                  <div className="rounded-xl bg-black/30 border border-white/5 p-3">
                    Player-paced:{' '}
                    <strong className={ents.allow_player_paced ? 'text-emerald-400' : 'text-rose-400'}>
                      {ents.allow_player_paced ? 'Có' : 'Không'}
                    </strong>
                  </div>
                  <div className="rounded-xl bg-black/30 border border-white/5 p-3">
                    Export logs:{' '}
                    <strong className={ents.allow_export_logs ? 'text-emerald-400' : 'text-rose-400'}>
                      {ents.allow_export_logs ? 'Có' : 'Pro only'}
                    </strong>
                  </div>
                  <div className="rounded-xl bg-black/30 border border-white/5 p-3">
                    Bỏ watermark:{' '}
                    <strong className={ents.allow_remove_watermark ? 'text-emerald-400' : 'text-rose-400'}>
                      {ents.allow_remove_watermark ? 'Có' : 'Pro only'}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plans.map((p) => {
                const isCurrent = ents?.plan_id === p.id
                const isPro = p.id === 'pro'
                return (
                  <div
                    key={p.id}
                    className={`rounded-2xl border p-5 space-y-3 ${
                      isCurrent
                        ? 'border-[#e85d4c]/40 bg-[#e85d4c]/5'
                        : 'border-white/10 bg-black/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-black text-[#f2f0eb]">{p.name}</h3>
                      <span className="text-sm font-bold text-[#c5c2ba]">
                        {p.price_monthly_vnd === 0
                          ? 'Miễn phí'
                          : `${p.price_monthly_vnd.toLocaleString('vi-VN')}₫/tháng`}
                      </span>
                    </div>
                    <p className="text-xs text-[#9a9eab] leading-relaxed">{p.description}</p>
                    <ul className="text-xs text-[#c5c2ba] space-y-1.5">
                      <li>• {formatLimit(p.max_players_per_room)} người / phòng</li>
                      <li>• {formatLimit(p.max_quizzes)} quiz · tối đa {formatLimit(p.max_questions_per_quiz)} câu/quiz</li>
                      <li>• {formatLimit(p.max_concurrent_rooms)} phòng đồng thời</li>
                      {isPro && <li className="text-[#e85d4c]">• Solo / player-paced + export logs</li>}
                    </ul>
                    <div
                      className={`w-full h-11 rounded-xl flex items-center justify-center text-sm font-bold ${
                        isCurrent
                          ? 'bg-[#e85d4c]/20 text-[#e85d4c]'
                          : 'bg-white/5 text-[#9a9eab]'
                      }`}
                    >
                      {isCurrent ? 'Đang dùng' : 'Liên hệ admin để nâng cấp'}
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="mt-4 text-[11px] text-center text-[#9a9eab]">
              User không thể tự đổi gói — license do admin quản lý tại{' '}
              {isAdmin ? (
                <Link href="/admin" className="text-[#e85d4c] underline underline-offset-2">
                  /admin
                </Link>
              ) : (
                <span className="text-[#c5c2ba]">/admin</span>
              )}
              .
            </p>
          </Card>

          <Card className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-[#e85d4c]/40" />
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-black text-[#f2f0eb]">Security Settings</h2>
              <p className="text-sm text-[#9a9eab] mt-2">Update your account password</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="old-password" className="text-xs font-bold uppercase tracking-wider text-[#9a9eab]">
                  Current Password
                </Label>
                <Input
                  id="old-password"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                  className="bg-black/40 border-white/5 focus:border-[#e85d4c]/50 text-[#f2f0eb] h-12 rounded-xl"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-password" className="text-xs font-bold uppercase tracking-wider text-[#9a9eab]">
                  New Password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="bg-black/40 border-white/5 focus:border-[#e85d4c]/50 text-[#f2f0eb] h-12 rounded-xl"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm-password" className="text-xs font-bold uppercase tracking-wider text-[#9a9eab]">
                  Confirm New Password
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="bg-black/40 border-white/5 focus:border-[#e85d4c]/50 text-[#f2f0eb] h-12 rounded-xl"
                />
              </div>

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-300 text-xs font-semibold">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-300 text-xs font-semibold">
                  {success}
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <Button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="flex-1 h-12 bg-white/5 hover:bg-white/10 text-[#f2f0eb] font-bold rounded-xl border border-white/10 cursor-pointer"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-[2] h-12 bg-[#e85d4c] hover:bg-[#d14e3e] text-white font-extrabold rounded-xl border-none cursor-pointer"
                >
                  {loading ? 'Updating...' : 'Change Password'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </GameBackground>
  )
}

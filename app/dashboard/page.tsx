'use client'

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { getMyQuizzes, createQuiz, deleteQuiz, getDashboardStats, createQuizFromMockTemplate, duplicateQuiz, updateQuiz, getSharedQuizzes } from '@/app/actions/quizzes'
import { GameBackground } from '@/components/game-background'
import { useToast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import {
  FileText,
  Gamepad2,
  Users,
  Target,
  LogOut,
  Trash2,
  Edit3,
  Play,
  Plus,
  Search,
  Calculator,
  Atom,
  Code,
  Lightbulb,
  Sparkles,
  ArrowRight,
  BookOpen,
  Hourglass,
  Calendar,
  Copy,
  X,
  Globe,
  Eye,
  Users2,
  Gift,
} from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LicenseLockedBanner } from '@/components/license-locked-banner'
import { LicenseExpiringBanner } from '@/components/license-expiring-banner'
import { getMyLicense, type LicenseSnapshot } from '@/app/actions/license'
import { isLicenseExpiringSoon, isLicenseLocked } from '@/lib/license'
import { TourButton } from '@/components/tour-button'
import { dashboardTour } from '@/lib/tours'

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  const format = useFormatter()
  const tCommon = useTranslations('common')
  const tAdmin = useTranslations('admin')
  const tTour = useTranslations('tours')
  const tLucky = useTranslations('luckyDraw')
  const router = useRouter()
  const toast = useToast()
  const [user, setUser] = useState<any>(null)
  const [quizzes, setQuizzes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'list' | 'shared' | 'quick-create'>('list')

  // Shared quizzes are paginated and searched on the server, unlike the host's
  // own list: this one is the whole platform's, so it cannot be filtered in
  // the browser off a single fetch.
  const [sharedQuizzes, setSharedQuizzes] = useState<any[]>([])
  const [sharedTotal, setSharedTotal] = useState(0)
  const [sharedPage, setSharedPage] = useState(1)
  const [sharedLoading, setSharedLoading] = useState(false)
  const [sharedSearch, setSharedSearch] = useState('')
  const SHARED_PAGE_SIZE = 12
  const [quickCreating, setQuickCreating] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [license, setLicense] = useState<LicenseSnapshot | null>(null)

  // Quick Edit Quiz States
  const [editQuizOpen, setEditQuizOpen] = useState(false)
  const [selectedQuizId, setSelectedQuizId] = useState('')
  const [editQuizTitle, setEditQuizTitle] = useState('')
  const [editQuizDescription, setEditQuizDescription] = useState('')

  const handleOpenEditQuiz = (quiz: any) => {
    setSelectedQuizId(quiz.id)
    setEditQuizTitle(quiz.title)
    setEditQuizDescription(quiz.description || '')
    setEditQuizOpen(true)
  }

  const handleSaveQuizInfo = async () => {
    if (!editQuizTitle.trim()) {
      toast.error(t('error'), t('titleRequired'))
      return
    }
    setActionLoading(`edit-${selectedQuizId}`)
    try {
      await updateQuiz(selectedQuizId, editQuizTitle, editQuizDescription)
      setQuizzes((prev: any) =>
        prev.map((q: any) =>
          q.id === selectedQuizId
            ? { ...q, title: editQuizTitle, description: editQuizDescription }
            : q
        )
      )
      setEditQuizOpen(false)
      toast.success(t('updated'))
    } catch (error) {
      console.error('Error updating quiz info:', error)
      toast.error(t('error'), t('updateFailed'))
    } finally {
      setActionLoading(null)
    }
  }

  const handleQuickCreate = async (theme: string) => {
    setQuickCreating(theme)
    try {
      const newQuiz = await createQuizFromMockTemplate(theme)
      toast.success(t('quickCreated'), t('redirecting'))
      router.push(`/quizzes/${newQuiz.id}`)
    } catch (error) {
      console.error('Error creating quick quiz:', error)
      toast.apiError(error, (href) => router.push(href))
    } finally {
      setQuickCreating(null)
    }
  }

  const handleDeleteQuiz = (quizId: string) => {
    toast.confirm(
      t('confirmDeleteBody'),
      async () => {
        try {
          await deleteQuiz(quizId)
          setQuizzes((prev) => prev.filter((q) => q.id !== quizId))
          setStats((prev) => ({
            ...prev,
            totalQuizzes: prev.totalQuizzes - 1,
          }))
          toast.success(t('deleted'))
        } catch (error) {
          console.error('Error deleting quiz:', error)
          toast.apiError(error, (href) => router.push(href))
        }
      },
      t('confirmDeleteWarning')
    )
  }

  const handleDuplicateQuiz = async (quizId: string) => {
    setActionLoading(`dup-${quizId}`)
    try {
      const copy = await duplicateQuiz(quizId)
      toast.success(t('duplicated'), copy.title)
      router.push(`/quizzes/${copy.id}`)
    } catch (error) {
      toast.apiError(error, (href) => router.push(href))
    } finally {
      setActionLoading(null)
    }
  }

  // Mock stats for higher fidelity dashboard experience
  const [stats, setStats] = useState({
    totalQuizzes: 0,
    totalSessions: 0,
    totalPlayers: 0,
    averageScore: '0%'
  })

  useEffect(() => {
    const loadData = async () => {
      try {
        const session = await authClient.getSession()
        if (!session?.user) {
          router.push('/sign-in')
          return
        }
        setUser(session.user)

        const myQuizzes = await getMyQuizzes()
        setQuizzes(myQuizzes)

        // License is fetched alongside, not gating: a failed license read must
        // not blank the dashboard. isLicenseLocked(null) is false, so the banner
        // simply does not show and the host still hits the real 403 on create.
        setLicense(await getMyLicense())

        const dbStats = await getDashboardStats()
        setStats({
          totalQuizzes: myQuizzes.length,
          totalSessions: dbStats.totalSessions,
          totalPlayers: dbStats.totalPlayers,
          averageScore: dbStats.averageScore
        })
      } catch (error: any) {
        console.error('Error loading dashboard:', error)
        toast.apiError(error?.message || error, (href) => router.push(href))
      } finally {
        setLoading(false)
      }
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast context identity is unstable; effect must not re-run on toast changes
  }, [router])

  // Refetches on tab, page and search. The 350ms wait is what keeps a typed
  // word from firing one platform-wide query per keystroke.
  useEffect(() => {
    if (activeTab !== 'shared') return
    let cancelled = false
    setSharedLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await getSharedQuizzes(sharedSearch, sharedPage, SHARED_PAGE_SIZE)
        if (cancelled) return
        setSharedQuizzes(data.quizzes)
        setSharedTotal(data.total)
      } catch (error) {
        console.error('Error loading shared quizzes:', error)
        if (!cancelled) {
          setSharedQuizzes([])
          setSharedTotal(0)
        }
      } finally {
        if (!cancelled) setSharedLoading(false)
      }
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [activeTab, sharedPage, sharedSearch])

  const handleCreateQuiz = async () => {
    setCreating(true)
    try {
      const newQuiz = await createQuiz('New Quiz', 'Click to edit description')
      toast.success(t('created'), t('redirectingEditor'))
      router.push(`/quizzes/${newQuiz.id}`)
    } catch (error: any) {
      console.error('Error creating quiz:', error)
      toast.apiError(error?.message || error, (href) => router.push(href))
    } finally {
      setCreating(false)
    }
  }

  const handleLogout = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <GameBackground variant="dashboard" showGrid={false}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center z-10 space-y-4">
            <Hourglass className="w-12 h-12 text-indigo-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400 text-sm tracking-wider uppercase font-bold">{t('loading')}</p>
          </div>
        </div>
      </GameBackground>
    )
  }

  return (
    <GameBackground variant="dashboard">
      <div className="flex-1 pb-16">

      {/* Header */}
      <header className="border-b border-white/5 bg-[#080c14]/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap gap-y-2 items-center justify-between">
          <BrandMark />
          <div className="flex flex-wrap justify-end items-center gap-2 sm:gap-4">
            <LanguageSwitcher />
            {user?.role === 'admin' && (
              <Link href="/admin">
                <Button
                  variant="ghost"
                  className="text-[#e85d4c] hover:text-[#f2f0eb] hover:bg-[#e85d4c]/10 h-11 sm:h-9 rounded-xl font-medium text-xs border-none"
                >
                  {tAdmin('console')}
                </Button>
              </Link>
            )}
            <Link href="/luckydraw">
              <Button
                variant="ghost"
                className="text-[#9a9eab] hover:text-[#f2f0eb] hover:bg-white/5 h-11 sm:h-9 rounded-xl font-medium text-xs border-none flex items-center gap-1.5"
              >
                <Gift className="w-4 h-4" />
                {tLucky('tab')}
              </Button>
            </Link>
            <Link href="/profile/settings">
              <Button
                variant="ghost"
                className="text-[#9a9eab] hover:text-[#f2f0eb] hover:bg-white/5 h-11 sm:h-9 rounded-xl font-medium text-xs border-none"
              >
                {tCommon('settings')}
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 shrink-0 rounded-full bg-[#e85d4c]/20 border border-[#e85d4c]/30 flex items-center justify-center font-semibold text-xs text-[#e85d4c]">
                {(user?.email?.[0] || 'H').toUpperCase()}
              </div>
              <span className="text-sm font-medium text-[#c5c2ba] truncate max-w-28 sm:max-w-none">{user?.nickname || 'User'}</span>
            </div>
            <Button 
              variant="outline" 
              onClick={handleLogout}
              className="border-[#2c313d] hover:bg-white/5 text-[#9a9eab] hover:text-[#f2f0eb] h-11 sm:h-9 rounded-xl transition-all flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{tCommon('signOut')}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-12 max-w-7xl space-y-8 sm:space-y-12" data-tour="dashboard-header">
        {isLicenseLocked(license) && (
          <LicenseLockedBanner onRedeemed={async () => setLicense(await getMyLicense())} />
        )}

        {/* Only when not already locked: a lapsed account gets the stronger
            banner, and showing both would be two calls to action for one fix. */}
        {!isLicenseLocked(license) && isLicenseExpiringSoon(license) && (
          <LicenseExpiringBanner
            days={license?.days_remaining ?? 0}
            onRedeemed={async () => setLicense(await getMyLicense())}
          />
        )}

        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/5 border border-white/10 rounded-3xl p-5 sm:p-8 backdrop-blur-md shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-purple-500 to-indigo-500"></div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white md:text-4xl">{t('title')}</h1>
            <p className="text-gray-400 mt-2 text-base max-w-xl">
              {t('subtitle')}
            </p>
          </div>
          <div className="w-full md:w-auto">
            <Button
              onClick={handleCreateQuiz}
              disabled={creating}
              size="lg"
              data-tour="create-quiz-btn"
              className="w-full md:w-auto bg-[#e85d4c] hover:bg-[#d44e3e] text-white font-extrabold h-12 sm:h-14 px-6 sm:px-8 rounded-2xl shadow-[0_4px_20px_rgba(168,85,247,0.3)] hover:shadow-[0_4px_25px_rgba(168,85,247,0.5)] transform hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex items-center gap-2 border-none"
            >
              {creating ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  {t('creating')}
                </span>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  {t('createQuiz')}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6" data-tour="stats-grid">
          {[
            { label: t('totalQuizzes'), value: stats.totalQuizzes, icon: FileText, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
            { label: t('battlesHosted'), value: stats.totalSessions, icon: Gamepad2, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
            { label: t('playersReached'), value: stats.totalPlayers, icon: Users, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
            { label: t('averageAccuracy'), value: stats.averageScore, icon: Target, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
          ].map((stat, i) => {
            const Icon = stat.icon
            return (
              <div key={i} className="bg-white/5 border border-white/5 rounded-2xl p-4 sm:p-6 backdrop-blur-sm flex items-center justify-between shadow-lg">
                <div className="space-y-1">
                  <p className="text-xs uppercase font-extrabold tracking-widest text-gray-500">{stat.label}</p>
                  <p className="text-2xl sm:text-3xl font-black text-white">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 shrink-0 rounded-xl border flex items-center justify-center ${stat.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            )
          })}
        </div>

        {/* Quizzes List & Quick Actions Section */}
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div className="flex gap-2 bg-black/30 p-1 rounded-xl border border-white/5 w-full md:w-auto" data-tour="quiz-tabs">
              <button
                onClick={() => setActiveTab('list')}
                className={`flex items-center justify-center gap-2 min-h-11 sm:min-h-0 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex-1 md:flex-none ${
                  activeTab === 'list' 
                    ? 'bg-[#e85d4c] text-[#fff8f5] shadow-md' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                {t('myQuizzes')}
              </button>
              <button
                onClick={() => setActiveTab('shared')}
                className={`flex items-center justify-center gap-2 min-h-11 sm:min-h-0 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex-1 md:flex-none ${
                  activeTab === 'shared'
                    ? 'bg-[#e85d4c] text-[#fff8f5] shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                {t('sharedQuizzes')}
              </button>
              <button
                onClick={() => setActiveTab('quick-create')}
                className={`flex items-center justify-center gap-2 min-h-11 sm:min-h-0 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex-1 md:flex-none ${
                  activeTab === 'quick-create' 
                    ? 'bg-[#e85d4c] text-[#fff8f5] shadow-md' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {t('starterPacks')}
              </button>
            </div>

            {activeTab === 'shared' && (
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  type="text"
                  placeholder={t('sharedSearchPlaceholder')}
                  value={sharedSearch}
                  onChange={(e) => {
                    setSharedSearch(e.target.value)
                    // A new term invalidates the page number: page 3 of the old
                    // result set is very likely past the end of the new one.
                    setSharedPage(1)
                  }}
                  className="w-full bg-black/40 border-white/5 focus:border-indigo-500/50 text-white placeholder-gray-500 pl-10 h-10 rounded-xl text-base sm:text-xs transition-all duration-300"
                />
              </div>
            )}

            {/* Search Input (Only for List tab) */}
            {activeTab === 'list' && (
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  type="text"
                  placeholder={t('searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border-white/5 focus:border-indigo-500/50 text-white placeholder-gray-500 pl-10 h-10 rounded-xl text-base sm:text-xs transition-all duration-300"
                />
              </div>
            )}
          </div>

          {activeTab === 'list' ? (
            // MY QUIZZES LIST TAB
            (() => {
              const filteredQuizzes = quizzes.filter(q => 
                q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (q.description && q.description.toLowerCase().includes(searchQuery.toLowerCase()))
              )

              if (filteredQuizzes.length === 0) {
                return (
                  <div
                    className="bg-white/5 border border-white/5 rounded-3xl p-6 sm:p-10 lg:p-16 text-center backdrop-blur-sm shadow-xl flex flex-col items-center justify-center space-y-6"
                    data-tour="quiz-list"
                  >
                    <BookOpen className="w-16 h-16 text-indigo-500/40 animate-pulse mx-auto" />
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-white">{t('noQuizzes')}</h3>
                      <p className="text-gray-400 text-sm max-w-sm leading-relaxed mx-auto">
                        {searchQuery 
                          ? `No quiz titles match "${searchQuery}". Try a different keyword.`
                          : t('emptyHint')
                        }
                      </p>
                    </div>
                    {!searchQuery && (
                      <Button
                        onClick={handleCreateQuiz}
                        size="lg"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-2xl border-none"
                      >
                        {t('createFirst')}
                      </Button>
                    )}
                  </div>
                )
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-tour="quiz-list">
                  {filteredQuizzes.map((quiz) => (
                    <div 
                      key={quiz.id} 
                      className="bg-white/5 border border-white/5 hover:border-white/15 rounded-3xl p-6 backdrop-blur-sm hover:shadow-2xl shadow-lg flex flex-col justify-between transition-all duration-300 group hover:translate-y-[-2px] min-h-[230px] h-auto"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                            <Gamepad2 className="w-5 h-5 text-purple-400" />
                          </div>
                          <div className="flex items-center gap-2">
                            {quiz.isPublic && (
                              <span
                                title={quiz.allowEdit ? t('sharedEditable') : t('sharedViewOnly')}
                                className="text-[10px] uppercase font-extrabold tracking-widest px-2 py-1 rounded-lg border text-sky-300 bg-sky-500/10 border-sky-500/20 flex items-center gap-1"
                              >
                                <Globe className="w-3 h-3" />
                                {t('shared')}
                              </span>
                            )}
                            <span className="text-[10px] uppercase font-extrabold tracking-widest text-indigo-400">
                              {quiz.questionCount ?? quiz.questions?.length ?? 0} Questions
                            </span>
                          </div>
                        </div>
                        <div 
                          onClick={() => handleOpenEditQuiz(quiz)}
                          title={t('quickEditHint')}
                          className="cursor-pointer group/info select-none"
                        >
                          <h3 className="text-xl font-bold text-white line-clamp-1 group-hover:text-purple-400 transition-colors flex items-center gap-1.5">
                            {quiz.title}
                            <Edit3 className="w-3.5 h-3.5 text-gray-500 opacity-0 group-hover/info:opacity-100 transition-opacity shrink-0" />
                          </h3>
                          <p className="text-gray-400 text-sm mt-1 line-clamp-2 leading-relaxed group-hover/info:text-gray-300">
                            {quiz.description || t('noDescription')}
                          </p>
                        </div>
                      </div>
                      
                      <div className="pt-4 border-t border-white/5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between mt-auto">
                        <span className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format.dateTime(new Date(quiz.createdAt || Date.now()), { dateStyle: 'short' })}
                        </span>
                        <div className="flex gap-2 flex-wrap justify-end">
                          <Button
                            size="sm"
                            onClick={() => handleDeleteQuiz(quiz.id)}
                            className="bg-rose-600/10 border border-rose-500/20 hover:bg-rose-600/20 text-rose-400 text-xs font-bold rounded-xl h-10 sm:h-9 px-3 cursor-pointer flex items-center gap-1 border-none"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('delete')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionLoading === `dup-${quiz.id}`}
                            onClick={() => handleDuplicateQuiz(quiz.id)}
                            className="border-white/10 hover:bg-white/5 text-xs font-bold text-gray-300 hover:text-white rounded-xl h-10 sm:h-9 flex items-center gap-1"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {actionLoading === `dup-${quiz.id}` ? '…' : t('duplicate')}
                          </Button>
                          <Link href={`/quizzes/${quiz.id}`}>
                            <Button size="sm" variant="outline" className="border-white/10 hover:bg-white/5 text-xs font-bold text-gray-300 hover:text-white rounded-xl h-10 sm:h-9 flex items-center gap-1">
                              <Edit3 className="w-3.5 h-3.5" />
                              {t('edit')}
                            </Button>
                          </Link>
                          <Link href={`/quizzes/${quiz.id}`} className="block">
                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md border-none h-10 sm:h-9 flex items-center gap-1">
                              <Play className="w-3.5 h-3.5" />
                              {t('launch')}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()
          ) : activeTab === 'shared' ? (
            // QUIZZES OTHER HOSTS HAVE PUBLISHED
            (() => {
              if (sharedLoading && sharedQuizzes.length === 0) {
                return (
                  <div className="bg-white/5 border border-white/5 rounded-3xl p-10 text-center backdrop-blur-sm">
                    <Hourglass className="w-10 h-10 text-indigo-400 animate-spin mx-auto" />
                  </div>
                )
              }

              if (sharedQuizzes.length === 0) {
                return (
                  <div className="bg-white/5 border border-white/5 rounded-3xl p-6 sm:p-10 lg:p-16 text-center backdrop-blur-sm shadow-xl flex flex-col items-center justify-center space-y-6">
                    <Globe className="w-16 h-16 text-indigo-500/40 mx-auto" />
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-white">{t('noSharedQuizzes')}</h3>
                      <p className="text-gray-400 text-sm max-w-sm leading-relaxed mx-auto">
                        {sharedSearch ? t('sharedNoMatch') : t('noSharedHint')}
                      </p>
                    </div>
                  </div>
                )
              }

              const pages = Math.max(1, Math.ceil(sharedTotal / SHARED_PAGE_SIZE))

              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sharedQuizzes.map((quiz) => (
                      <div
                        key={quiz.id}
                        className="bg-white/5 border border-white/5 hover:border-white/15 rounded-3xl p-6 backdrop-blur-sm hover:shadow-2xl shadow-lg flex flex-col justify-between transition-all duration-300 group hover:translate-y-[-2px] min-h-[230px] h-auto"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                              <Globe className="w-5 h-5 text-sky-400" />
                            </div>
                            <span className="text-[10px] uppercase font-extrabold tracking-widest text-indigo-400">
                              {quiz.questionCount} Questions
                            </span>
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-white line-clamp-1">{quiz.title}</h3>
                            <p className="text-gray-400 text-sm mt-1 line-clamp-2 leading-relaxed">
                              {quiz.description || t('noDescription')}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Says up front whether opening this leads to an
                                editor or a reader, so nobody discovers it on
                                the first keystroke. */}
                            <span
                              className={`text-[10px] uppercase font-extrabold tracking-widest px-2 py-1 rounded-lg border ${
                                quiz.allowEdit
                                  ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                                  : 'text-gray-400 bg-white/5 border-white/10'
                              }`}
                            >
                              {quiz.allowEdit ? t('sharedEditable') : t('sharedViewOnly')}
                            </span>
                            {quiz.isOwner && (
                              <span className="text-[10px] uppercase font-extrabold tracking-widest px-2 py-1 rounded-lg border text-purple-300 bg-purple-500/10 border-purple-500/20">
                                {t('yourQuiz')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="pt-4 border-t border-white/5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between mt-auto">
                          <span className="text-[11px] text-gray-500 flex items-center gap-1 truncate">
                            <Users2 className="w-3 h-3 shrink-0" />
                            {t('byAuthor', { name: quiz.authorName })}
                          </span>
                          <div className="flex gap-2 justify-end">
                            <Link href={`/quizzes/${quiz.id}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-white/10 hover:bg-white/5 text-xs font-bold text-gray-300 hover:text-white rounded-xl h-10 sm:h-9 flex items-center gap-1"
                              >
                                {quiz.allowEdit ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                {t('open')}
                              </Button>
                            </Link>
                            {/* The primary action, because taking a copy is
                                how somebody makes a shared quiz their own —
                                the original stays read-only for everyone but
                                its author. */}
                            <Button
                              size="sm"
                              disabled={actionLoading === `dup-${quiz.id}`}
                              onClick={() => handleDuplicateQuiz(quiz.id)}
                              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md border-none h-10 sm:h-9 flex items-center gap-1"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {actionLoading === `dup-${quiz.id}` ? '…' : t('duplicate')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {pages > 1 && (
                    <div className="flex items-center justify-center gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sharedPage <= 1 || sharedLoading}
                        onClick={() => setSharedPage((p) => Math.max(1, p - 1))}
                        className="border-white/10 hover:bg-white/5 text-xs font-bold text-gray-300 rounded-xl h-10"
                      >
                        {t('prevPage')}
                      </Button>
                      <span className="text-xs text-gray-400 font-medium">
                        {t('pageOf', { page: sharedPage, pages })}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sharedPage >= pages || sharedLoading}
                        onClick={() => setSharedPage((p) => p + 1)}
                        className="border-white/10 hover:bg-white/5 text-xs font-bold text-gray-300 rounded-xl h-10"
                      >
                        {t('nextPage')}
                      </Button>
                    </div>
                  )}
                </div>
              )
            })()
          ) : (
            // STARTER PACKS
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { 
                  theme: 'math', 
                  title: t('packMath'), 
                  description: t('packMathBody'), 
                  icon: Calculator, 
                  color: 'from-purple-500/15 to-indigo-500/5 hover:border-purple-500/30 text-purple-400',
                  questionsCount: 3
                },
                { 
                  theme: 'science', 
                  title: t('packScience'), 
                  description: t('packScienceBody'), 
                  icon: Atom, 
                  color: 'from-pink-500/15 to-rose-500/5 hover:border-pink-500/30 text-pink-400',
                  questionsCount: 2
                },
                { 
                  theme: 'programming', 
                  title: t('packWeb'), 
                  description: t('packWebBody'), 
                  icon: Code, 
                  color: 'from-blue-500/15 to-cyan-500/5 hover:border-blue-500/30 text-blue-400',
                  questionsCount: 2
                },
                { 
                  theme: 'general', 
                  title: t('packGeneral'), 
                  description: t('packGeneralBody'), 
                  icon: Lightbulb, 
                  color: 'from-amber-500/15 to-yellow-500/5 hover:border-amber-500/30 text-amber-400',
                  questionsCount: 1
                },
              ].map((action) => {
                const Icon = action.icon
                const isCurrentCreating = quickCreating === action.theme
                return (
                  <div
                    key={action.theme}
                    className={`bg-gradient-to-b ${action.color} border border-white/5 rounded-3xl p-6 flex flex-col justify-between min-h-[280px] h-auto shadow-lg transition-all duration-300 hover:translate-y-[-4px] relative overflow-hidden group`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-[10px] uppercase font-extrabold tracking-widest text-indigo-300">
                          {action.questionsCount} Questions
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
                          {action.title}
                        </h3>
                        <p className="text-gray-400 text-xs leading-relaxed line-clamp-3">
                          {action.description}
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={() => handleQuickCreate(action.theme)}
                      disabled={quickCreating !== null}
                      className="w-full h-11 bg-white/10 hover:bg-white text-white hover:text-black font-extrabold text-xs rounded-xl shadow-md transition-all duration-300 cursor-pointer border-none flex items-center justify-center gap-1.5 mt-4"
                    >
                      {isCurrentCreating ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                          {t('generating')}
                        </>
                      ) : (
                        <>
                          {t('createDemo')}
                          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                        </>
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {editQuizOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[#1a1d26] p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">{t('editQuizTitle')}</h2>
              <button
                onClick={() => setEditQuizOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:text-white transition-colors bg-transparent border-none cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">{t('quizName')}</label>
                <Input
                  type="text"
                  value={editQuizTitle}
                  onChange={(e) => setEditQuizTitle(e.target.value)}
                  placeholder={t('quizNamePlaceholder')}
                  className="w-full bg-[#12141a] border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">{t('quizDescription')}</label>
                <textarea
                  value={editQuizDescription}
                  onChange={(e) => setEditQuizDescription(e.target.value)}
                  placeholder={t('quizDescPlaceholder')}
                  rows={4}
                  className="w-full bg-[#12141a] border border-white/10 focus:border-purple-500 text-white placeholder:text-gray-500 rounded-xl p-3 focus:outline-none text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setEditQuizOpen(false)}
                className="h-11 w-full sm:h-10 sm:w-auto border-white/10 bg-transparent text-white hover:bg-white/5 px-4 rounded-xl"
              >
                {tCommon('cancel')}
              </Button>
              <Button
                onClick={handleSaveQuizInfo}
                disabled={actionLoading === `edit-${selectedQuizId}`}
                className="h-11 w-full sm:h-10 sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-5 rounded-xl border-none"
              >
                {actionLoading === `edit-${selectedQuizId}` ? t('saving') : t('save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      </div>
      <TourButton tour={dashboardTour(tTour)} label={t('guide')} position="bottom-right" />
    </GameBackground>
  )
}

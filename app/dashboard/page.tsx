'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { getMyQuizzes, createQuiz, deleteQuiz, getDashboardStats, createQuizFromMockTemplate, duplicateQuiz, updateQuiz } from '@/app/actions/quizzes'
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
} from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { TourButton } from '@/components/tour-button'
import { dashboardTour } from '@/lib/tours'

export default function DashboardPage() {
  const router = useRouter()
  const toast = useToast()
  const [user, setUser] = useState<any>(null)
  const [quizzes, setQuizzes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'list' | 'quick-create'>('list')
  const [quickCreating, setQuickCreating] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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
      toast.error('Lỗi', 'Tên quiz không được để trống.')
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
      toast.success('Đã cập nhật thông tin quiz thành công!')
    } catch (error) {
      console.error('Error updating quiz info:', error)
      toast.error('Lỗi', 'Không thể cập nhật thông tin quiz.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleQuickCreate = async (theme: string) => {
    setQuickCreating(theme)
    try {
      const newQuiz = await createQuizFromMockTemplate(theme)
      toast.success('Đã tạo nhanh Quiz', 'Đang chuyển hướng...')
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
      'Xác nhận xóa Quiz',
      async () => {
        try {
          await deleteQuiz(quizId)
          setQuizzes((prev) => prev.filter((q) => q.id !== quizId))
          setStats((prev) => ({
            ...prev,
            totalQuizzes: prev.totalQuizzes - 1,
          }))
          toast.success('Đã xóa Quiz thành công!')
        } catch (error) {
          console.error('Error deleting quiz:', error)
          toast.apiError(error, (href) => router.push(href))
        }
      },
      'Hành động này không thể khôi phục. Bạn có chắc chắn muốn xóa Quiz này không?'
    )
  }

  const handleDuplicateQuiz = async (quizId: string) => {
    setActionLoading(`dup-${quizId}`)
    try {
      const copy = await duplicateQuiz(quizId)
      toast.success('Đã nhân bản quiz', copy.title)
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
  }, [router])

  const handleCreateQuiz = async () => {
    setCreating(true)
    try {
      const newQuiz = await createQuiz('New Quiz', 'Click to edit description')
      toast.success('Đã tạo Quiz mới', 'Đang chuyển hướng đến trình thiết kế...')
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
            <p className="text-gray-400 text-sm tracking-wider uppercase font-bold">Loading dashboard...</p>
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
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <BrandMark />
          <div className="flex items-center gap-6">
            {user?.role === 'admin' && (
              <Link href="/admin">
                <Button
                  variant="ghost"
                  className="text-[#e85d4c] hover:text-[#f2f0eb] hover:bg-[#e85d4c]/10 h-9 rounded-xl font-medium text-xs border-none"
                >
                  Admin Console
                </Button>
              </Link>
            )}
            <Link href="/profile/settings">
              <Button
                variant="ghost"
                className="text-[#9a9eab] hover:text-[#f2f0eb] hover:bg-white/5 h-9 rounded-xl font-medium text-xs border-none"
              >
                Settings
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#e85d4c]/20 border border-[#e85d4c]/30 flex items-center justify-center font-semibold text-xs text-[#e85d4c]">
                {(user?.email?.[0] || 'H').toUpperCase()}
              </div>
              <span className="text-sm font-medium text-[#c5c2ba]">{user?.nickname || 'User'}</span>
            </div>
            <Button 
              variant="outline" 
              onClick={handleLogout}
              className="border-[#2c313d] hover:bg-white/5 text-[#9a9eab] hover:text-[#f2f0eb] h-9 rounded-xl transition-all flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12 max-w-7xl space-y-12" data-tour="dashboard-header">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-md shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-purple-500 to-indigo-500"></div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">Creator Dashboard</h1>
            <p className="text-gray-400 mt-2 text-base max-w-xl">
              Design custom quizzes, run realtime matches, and keep track of student scores here.
            </p>
          </div>
          <div>
            <Button
              onClick={handleCreateQuiz}
              disabled={creating}
              size="lg"
              data-tour="create-quiz-btn"
              className="bg-[#e85d4c] hover:bg-[#d44e3e] text-white font-extrabold h-14 px-8 rounded-2xl shadow-[0_4px_20px_rgba(168,85,247,0.3)] hover:shadow-[0_4px_25px_rgba(168,85,247,0.5)] transform hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex items-center gap-2 border-none"
            >
              {creating ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Creating...
                </span>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Create New Quiz
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6" data-tour="stats-grid">
          {[
            { label: 'Total Quizzes', value: stats.totalQuizzes, icon: FileText, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
            { label: 'Battles Hosted', value: stats.totalSessions, icon: Gamepad2, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
            { label: 'Players Reached', value: stats.totalPlayers, icon: Users, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
            { label: 'Average Accuracy', value: stats.averageScore, icon: Target, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
          ].map((stat, i) => {
            const Icon = stat.icon
            return (
              <div key={i} className="bg-white/5 border border-white/5 rounded-2xl p-6 backdrop-blur-sm flex items-center justify-between shadow-lg">
                <div className="space-y-1">
                  <p className="text-xs uppercase font-extrabold tracking-widest text-gray-500">{stat.label}</p>
                  <p className="text-3xl font-black text-white">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${stat.color}`}>
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
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex-1 md:flex-none ${
                  activeTab === 'list' 
                    ? 'bg-[#e85d4c] text-[#fff8f5] shadow-md' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                My Quizzes
              </button>
              <button
                onClick={() => setActiveTab('quick-create')}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex-1 md:flex-none ${
                  activeTab === 'quick-create' 
                    ? 'bg-[#e85d4c] text-[#fff8f5] shadow-md' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Starter packs
              </button>
            </div>

            {/* Search Input (Only for List tab) */}
            {activeTab === 'list' && (
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  type="text"
                  placeholder="Search quizzes by title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border-white/5 focus:border-indigo-500/50 text-white placeholder-gray-500 pl-10 h-10 rounded-xl text-xs transition-all duration-300"
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
                    className="bg-white/5 border border-white/5 rounded-3xl p-16 text-center backdrop-blur-sm shadow-xl flex flex-col items-center justify-center space-y-6"
                    data-tour="quiz-list"
                  >
                    <BookOpen className="w-16 h-16 text-indigo-500/40 animate-pulse mx-auto" />
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-white">No quizzes found</h3>
                      <p className="text-gray-400 text-sm max-w-sm leading-relaxed mx-auto">
                        {searchQuery 
                          ? `No quiz titles match "${searchQuery}". Try a different keyword.`
                          : 'Start by building your first quiz. You can add customized questions, configure timers, and launch sessions.'
                        }
                      </p>
                    </div>
                    {!searchQuery && (
                      <Button
                        onClick={handleCreateQuiz}
                        size="lg"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-2xl border-none"
                      >
                        Create Your First Quiz
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
                      className="bg-white/5 border border-white/5 hover:border-white/15 rounded-3xl p-6 backdrop-blur-sm hover:shadow-2xl shadow-lg flex flex-col justify-between transition-all duration-300 group hover:translate-y-[-2px] h-[230px]"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                            <Gamepad2 className="w-5 h-5 text-purple-400" />
                          </div>
                          <span className="text-[10px] uppercase font-extrabold tracking-widest text-indigo-400">
                            {quiz.questionCount ?? quiz.questions?.length ?? 0} Questions
                          </span>
                        </div>
                        <div 
                          onClick={() => handleOpenEditQuiz(quiz)}
                          title="Click để sửa nhanh tên và mô tả"
                          className="cursor-pointer group/info select-none"
                        >
                          <h3 className="text-xl font-bold text-white line-clamp-1 group-hover:text-purple-400 transition-colors flex items-center gap-1.5">
                            {quiz.title}
                            <Edit3 className="w-3.5 h-3.5 text-gray-500 opacity-0 group-hover/info:opacity-100 transition-opacity shrink-0" />
                          </h3>
                          <p className="text-gray-400 text-sm mt-1 line-clamp-2 leading-relaxed group-hover/info:text-gray-300">
                            {quiz.description || 'No description provided.'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="pt-4 border-t border-white/5 flex items-center justify-between gap-4 mt-auto">
                        <span className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(quiz.createdAt || Date.now()).toLocaleDateString('vi-VN')}
                        </span>
                        <div className="flex gap-2 flex-wrap justify-end">
                          <Button
                            size="sm"
                            onClick={() => handleDeleteQuiz(quiz.id)}
                            className="bg-rose-600/10 border border-rose-500/20 hover:bg-rose-600/20 text-rose-400 text-xs font-bold rounded-xl h-9 px-3 cursor-pointer flex items-center gap-1 border-none"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionLoading === `dup-${quiz.id}`}
                            onClick={() => handleDuplicateQuiz(quiz.id)}
                            className="border-white/10 hover:bg-white/5 text-xs font-bold text-gray-300 hover:text-white rounded-xl h-9 flex items-center gap-1"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {actionLoading === `dup-${quiz.id}` ? '…' : 'Nhân bản'}
                          </Button>
                          <Link href={`/quizzes/${quiz.id}`}>
                            <Button size="sm" variant="outline" className="border-white/10 hover:bg-white/5 text-xs font-bold text-gray-300 hover:text-white rounded-xl h-9 flex items-center gap-1">
                              <Edit3 className="w-3.5 h-3.5" />
                              Edit
                            </Button>
                          </Link>
                          <Link href={`/quizzes/${quiz.id}`} className="block">
                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md border-none h-9 flex items-center gap-1">
                              <Play className="w-3.5 h-3.5" />
                              Launch
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()
          ) : (
            // STARTER PACKS
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { 
                  theme: 'math', 
                  title: 'Math Challenge', 
                  description: 'Generate a quiz with basic arithmetic, prime numbers, and square roots.', 
                  icon: Calculator, 
                  color: 'from-purple-500/15 to-indigo-500/5 hover:border-purple-500/30 text-purple-400',
                  questionsCount: 3
                },
                { 
                  theme: 'science', 
                  title: 'Science Trivia', 
                  description: 'Generate a science quiz testing boiling points, solar system basics, and space facts.', 
                  icon: Atom, 
                  color: 'from-pink-500/15 to-rose-500/5 hover:border-pink-500/30 text-pink-400',
                  questionsCount: 2
                },
                { 
                  theme: 'programming', 
                  title: 'Web Dev Basics', 
                  description: 'Generate a coding quiz about HTML selectors, CSS styling rules, and basic JavaScript.', 
                  icon: Code, 
                  color: 'from-blue-500/15 to-cyan-500/5 hover:border-blue-500/30 text-blue-400',
                  questionsCount: 2
                },
                { 
                  theme: 'general', 
                  title: 'General Knowledge', 
                  description: 'Generate a miscellaneous trivia quiz about capital cities, geographical facts, and culture.', 
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
                    className={`bg-gradient-to-b ${action.color} border border-white/5 rounded-3xl p-6 flex flex-col justify-between h-[280px] shadow-lg transition-all duration-300 hover:translate-y-[-4px] relative overflow-hidden group`}
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
                          Generating...
                        </>
                      ) : (
                        <>
                          Create Demo Quiz
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
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1d26] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">Chỉnh sửa thông tin Quiz</h2>
              <button
                onClick={() => setEditQuizOpen(false)}
                className="text-gray-400 hover:text-white transition-colors bg-transparent border-none cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Tên Quiz</label>
                <Input
                  type="text"
                  value={editQuizTitle}
                  onChange={(e) => setEditQuizTitle(e.target.value)}
                  placeholder="Nhập tên quiz..."
                  className="w-full bg-[#12141a] border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Mô tả</label>
                <textarea
                  value={editQuizDescription}
                  onChange={(e) => setEditQuizDescription(e.target.value)}
                  placeholder="Nhập mô tả cho quiz này..."
                  rows={4}
                  className="w-full bg-[#12141a] border border-white/10 focus:border-purple-500 text-white placeholder:text-gray-500 rounded-xl p-3 focus:outline-none text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setEditQuizOpen(false)}
                className="border-white/10 bg-transparent text-white hover:bg-white/5 px-4 rounded-xl"
              >
                Hủy
              </Button>
              <Button
                onClick={handleSaveQuizInfo}
                disabled={actionLoading === `edit-${selectedQuizId}`}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 rounded-xl border-none"
              >
                {actionLoading === `edit-${selectedQuizId}` ? 'Đang lưu...' : 'Lưu lại'}
              </Button>
            </div>
          </div>
        </div>
      )}

      </div>
      <TourButton tour={dashboardTour} label="Hướng dẫn" position="bottom-right" />
    </GameBackground>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { uploadImageAction } from '@/app/actions/upload'
import { ImagePlus, Link2, Search, Upload, X, Loader2 } from 'lucide-react'

interface GiphyPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (url: string) => void
}

const GIPHY_PROXY = '/api/giphy'

const SUGGESTIONS = ['reactions', 'education', 'science', 'celebration', 'funny', 'yes', 'no', 'thinking']

export function GiphyPicker({ isOpen, onClose, onSelect }: GiphyPickerProps) {
  const [mediaTab, setMediaTab] = useState<'giphy' | 'upload' | 'url'>('giphy')
  const [searchQuery, setSearchQuery] = useState('')
  const [gifs, setGifs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setMediaTab('giphy')
    setSearchQuery('')
    setImageUrlInput('')
    fetchTrendingGifs()
    const t = setTimeout(() => searchRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const fetchTrendingGifs = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${GIPHY_PROXY}?mode=trending&limit=24`)
      const data = await res.json()
      setGifs(data.data || [])
    } catch (error) {
      console.error('Error fetching trending GIFs:', error)
      setGifs([])
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (queryStr: string = searchQuery) => {
    if (!queryStr.trim()) {
      fetchTrendingGifs()
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `${GIPHY_PROXY}?mode=search&q=${encodeURIComponent(queryStr)}&limit=24`
      )
      const data = await res.json()
      setGifs(data.data || [])
    } catch (error) {
      console.error('Error searching Giphy:', error)
      setGifs([])
    } finally {
      setLoading(false)
    }
  }

  const pick = (url: string) => {
    onSelect(url)
    onClose()
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await uploadImageAction(formData)
      if (res.success && res.url) {
        pick(res.url)
      } else {
        alert(res.error || 'Failed to upload image')
      }
    } catch (err) {
      console.error('Upload error:', err)
      alert('Error uploading file')
    } finally {
      setUploading(false)
    }
  }

  if (!isOpen) return null

  const tabs = [
    { id: 'giphy' as const, label: 'GIF library', icon: Search },
    { id: 'upload' as const, label: 'Upload', icon: Upload },
    { id: 'url' as const, label: 'Link', icon: Link2 },
  ]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#0a0b0f]/75 backdrop-blur-sm p-0 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-picker-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1a1d26] border border-[#2c313d] sm:rounded-2xl rounded-t-2xl w-full max-w-3xl h-[92vh] sm:h-[min(80vh,720px)] flex flex-col overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.45)] animate-in fade-in zoom-in-95 duration-200"
      >
        <header className="px-5 sm:px-6 py-4 border-b border-[#2c313d] flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 id="media-picker-title" className="text-lg font-semibold text-[#f2f0eb] tracking-tight">
              Add media
            </h2>
            <p className="text-sm text-[#9a9eab] mt-0.5">
              Search GIFs, upload a file, or paste an image link.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 h-9 w-9 rounded-xl border border-[#2c313d] bg-[#12141a] text-[#9a9eab] hover:text-[#f2f0eb] hover:border-[#3d4454] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 sm:px-6 pt-3 shrink-0">
          <div className="flex gap-1 p-1 rounded-xl bg-[#12141a] border border-[#2c313d]">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const active = mediaTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMediaTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer border-none ${
                    active
                      ? 'bg-[#1a1d26] text-[#f2f0eb] shadow-sm'
                      : 'bg-transparent text-[#9a9eab] hover:text-[#c5c2ba]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.id === 'giphy' ? 'GIF' : tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {mediaTab === 'giphy' && (
          <>
            <div className="px-5 sm:px-6 py-4 space-y-3 border-b border-[#2c313d] shrink-0">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5c6170] pointer-events-none" />
                  <Input
                    ref={searchRef}
                    type="text"
                    placeholder="Search GIFs…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-9 bg-[#12141a] border-[#2c313d] focus:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] h-11 rounded-xl"
                  />
                </div>
                <Button
                  onClick={() => handleSearch()}
                  className="bg-[#e85d4c] hover:bg-[#d44e3e] text-[#fff8f5] font-semibold px-5 h-11 rounded-xl border-none shrink-0"
                >
                  Search
                </Button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    fetchTrendingGifs()
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    !searchQuery
                      ? 'bg-[#e85d4c]/15 border-[#e85d4c]/40 text-[#e85d4c]'
                      : 'bg-[#12141a] border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb]'
                  }`}
                >
                  Trending
                </button>
                {SUGGESTIONS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSearchQuery(cat)
                      handleSearch(cat)
                    }}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer capitalize ${
                      searchQuery.toLowerCase() === cat
                        ? 'bg-[#e85d4c]/15 border-[#e85d4c]/40 text-[#e85d4c]'
                        : 'bg-[#12141a] border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              {loading ? (
                <div className="h-full min-h-[200px] flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-7 w-7 text-[#e85d4c] animate-spin" />
                  <p className="text-sm text-[#9a9eab]">Loading GIFs…</p>
                </div>
              ) : gifs.length === 0 ? (
                <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center gap-2 px-4">
                  <ImagePlus className="h-8 w-8 text-[#3d4454]" />
                  <p className="text-sm font-medium text-[#f2f0eb]">No results</p>
                  <p className="text-xs text-[#9a9eab] max-w-xs">
                    Try a shorter keyword, or browse Trending.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {gifs.map((gif, i) => {
                    const url = gif.images?.fixed_height?.url || gif.images?.downsized?.url
                    if (!url) return null
                    return (
                      <button
                        key={gif.id || i}
                        type="button"
                        onClick={() => pick(url)}
                        className="group relative aspect-square rounded-xl overflow-hidden border border-[#2c313d] bg-[#12141a] cursor-pointer transition-all duration-200 hover:border-[#e85d4c]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d4c]/40"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={gif.title || 'GIF'}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                        <span className="absolute inset-x-0 bottom-0 py-2 text-center text-[11px] font-medium text-[#fff8f5] bg-gradient-to-t from-[#0a0b0f]/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          Use this
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <footer className="px-5 sm:px-6 py-2.5 border-t border-[#2c313d] shrink-0">
              <p className="text-[10px] text-[#5c6170] text-right">Powered by Giphy</p>
            </footer>
          </>
        )}

        {mediaTab === 'upload' && (
          <div className="flex-1 p-5 sm:p-8 flex flex-col items-center justify-center">
            <div className="w-full max-w-md space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-base font-semibold text-[#f2f0eb]">Upload from device</h3>
                <p className="text-sm text-[#9a9eab]">PNG, JPG, WEBP, or GIF · max 5MB</p>
              </div>

              {uploading ? (
                <div className="h-40 rounded-2xl border border-[#2c313d] bg-[#12141a] flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-6 w-6 text-[#e85d4c] animate-spin" />
                  <p className="text-sm text-[#9a9eab]">Uploading…</p>
                </div>
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    handleFile(e.dataTransfer.files?.[0])
                  }}
                  className={`w-full h-44 rounded-2xl border border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                    dragOver
                      ? 'border-[#e85d4c] bg-[#e85d4c]/10'
                      : 'border-[#2c313d] bg-[#12141a] hover:border-[#3d4454] hover:bg-[#12141a]/80'
                  }`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#2c313d] bg-[#1a1d26]">
                    <Upload className="h-5 w-5 text-[#c5c2ba]" />
                  </div>
                  <div className="text-center px-4">
                    <p className="text-sm font-medium text-[#f2f0eb]">Drop a file here</p>
                    <p className="text-xs text-[#9a9eab] mt-1">or click to browse</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {mediaTab === 'url' && (
          <div className="flex-1 p-5 sm:p-8 flex flex-col items-center justify-center">
            <div className="w-full max-w-md space-y-5">
              <div className="text-center space-y-1">
                <h3 className="text-base font-semibold text-[#f2f0eb]">Paste image URL</h3>
                <p className="text-sm text-[#9a9eab]">Must be a direct HTTPS link to an image file.</p>
              </div>

              <Input
                type="url"
                placeholder="https://…"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    ;(e.target as HTMLInputElement).blur()
                    document.getElementById('apply-image-url')?.click()
                  }
                }}
                className="bg-[#12141a] border-[#2c313d] focus:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] h-11 rounded-xl"
              />

              <Button
                id="apply-image-url"
                onClick={() => {
                  const raw = imageUrlInput.trim()
                  try {
                    const u = new URL(raw)
                    if (u.protocol !== 'https:') {
                      alert('Only HTTPS image URLs are allowed')
                      return
                    }
                    pick(raw)
                  } catch {
                    alert('Invalid image URL')
                  }
                }}
                disabled={!imageUrlInput.trim()}
                className="w-full bg-[#e85d4c] hover:bg-[#d44e3e] disabled:opacity-40 text-[#fff8f5] font-semibold h-11 rounded-xl border-none"
              >
                Use link
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

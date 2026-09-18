'use server'

import { writeFile, mkdir, readdir, stat } from 'fs/promises'
import { join, extname } from 'path'
import { randomBytes } from 'crypto'
import { getSession } from '@/lib/session'
import { getTranslations } from 'next-intl/server'

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

// 2MB. Quiz images are shown on a projector or a phone, where 1080p is the
// ceiling that matters — 5MB only ever meant an unresized phone photo, and at
// 100 questions per quiz that was 500MB of one host's quota for one quiz.
const MAX_BYTES = 2 * 1024 * 1024

// Total bytes one host may keep in the upload store. A quiz caps at 100
// questions, and observed images run well under 100 KB, so a fully illustrated
// quiz costs ~10 MB — the default leaves room for roughly a hundred of them
// while bounding what a single account can do to the disk.
const DEFAULT_QUOTA_BYTES = 1024 * 1024 * 1024 // 1GB

function quotaBytes(): number {
  const raw = Number(process.env.UPLOAD_QUOTA_BYTES_PER_USER)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_QUOTA_BYTES
}

// Files are flat in one directory and carry their owner in the name, so usage
// is a directory listing filtered by prefix — no extra table, and nothing to
// keep in sync with the files actually on disk.
function ownerPrefix(userId: string): string {
  return `img-u${userId}-`
}

async function usedBytes(dir: string, userId: string): Promise<number> {
  let total = 0
  const prefix = ownerPrefix(userId)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return 0 // first upload: directory does not exist yet
  }
  for (const name of names) {
    if (!name.startsWith(prefix)) continue
    try {
      total += (await stat(join(dir, name))).size
    } catch {
      // raced with a cleanup sweep; treat as gone
    }
  }
  return total
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
}

export async function uploadImageAction(formData: FormData) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return { success: false, error: 'Unauthorized' }
    }

    const file = formData.get('file') as File | null
    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    if (file.size > MAX_BYTES) {
      return { success: false, error: 'File too large (max 2MB)' }
    }

    const mime = file.type
    const safeExt = ALLOWED_MIME[mime]
    if (!safeExt) {
      return { success: false, error: 'Only JPEG, PNG, WebP, and GIF images are allowed' }
    }

    // Reject double extensions / spoofed names (e.g. file.html.jpg already ok; block .svg)
    const originalExt = extname(file.name || '').toLowerCase()
    if (originalExt === '.svg' || originalExt === '.html' || originalExt === '.htm') {
      return { success: false, error: 'File type not allowed' }
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Sniff magic bytes for common image formats
    if (!looksLikeImage(buffer, mime)) {
      return { success: false, error: 'File content does not match an allowed image type' }
    }

    // Keep uploads outside public/ — Next.js production only indexes public/
    // at process start, so runtime writes there 404 until restart.
    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
    await mkdir(uploadDir, { recursive: true })

    // Checked after the content checks so a rejected file never counts against
    // the quota, and before the write so the limit is actually a limit.
    const quota = quotaBytes()
    const used = await usedBytes(uploadDir, session.user.id)
    if (used + buffer.byteLength > quota) {
      return {
        success: false,
        error: (await getTranslations('media'))('quotaExceeded', {
          used: formatMB(used),
          quota: formatMB(quota),
        }),
      }
    }

    const fileName = `${ownerPrefix(session.user.id)}${Date.now()}-${randomBytes(8).toString('hex')}${safeExt}`
    const filePath = join(uploadDir, fileName)
    await writeFile(filePath, buffer)

    return {
      success: true,
      url: `/uploads/${fileName}`,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload image'
    console.error('Error handling upload image action:', message)
    return {
      success: false,
      error: 'Failed to upload image',
    }
  }
}

function looksLikeImage(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false
  if (mime === 'image/jpeg' && buf[0] === 0xff && buf[1] === 0xd8) return true
  if (mime === 'image/png' && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true
  if (mime === 'image/gif' && buf.slice(0, 3).toString('ascii') === 'GIF') return true
  if (
    mime === 'image/webp' &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true
  }
  return false
}

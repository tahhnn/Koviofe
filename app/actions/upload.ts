'use server'

import { writeFile, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomBytes } from 'crypto'
import { getSession } from '@/lib/session'

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

const MAX_BYTES = 5 * 1024 * 1024 // 5MB

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
      return { success: false, error: 'File too large (max 5MB)' }
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

    const fileName = `img-${Date.now()}-${randomBytes(8).toString('hex')}${safeExt}`
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

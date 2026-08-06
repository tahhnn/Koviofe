import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { basename, extname, join } from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

function uploadDirs(): string[] {
  const primary = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
  // Legacy path used before runtime uploads were moved out of public/
  const legacy = join(process.cwd(), 'public', 'uploads')
  return primary === legacy ? [primary] : [primary, legacy]
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename: raw } = await context.params
  const filename = basename(raw || '')
  if (!filename || filename !== raw || filename.includes('..')) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const ext = extname(filename).toLowerCase()
  const mime = MIME[ext]
  if (!mime) {
    return new NextResponse('Not Found', { status: 404 })
  }

  for (const dir of uploadDirs()) {
    try {
      const data = await readFile(join(dir, filename))
      return new NextResponse(data, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Length': String(data.byteLength),
        },
      })
    } catch {
      // try next dir
    }
  }

  return new NextResponse('Not Found', { status: 404 })
}

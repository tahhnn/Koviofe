import { NextRequest, NextResponse } from 'next/server'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { extname } from 'path'
import { Readable } from 'stream'
import { DOWNLOAD_MIME, resolveDownloadPath } from '@/lib/luckydraw'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Serves a LuckyDraw build.
 *
 * In production the gateway serves these bytes straight off the shared volume
 * and this handler never runs; it is the fallback for a stack without nginx in
 * front (dev) and for the gateway's own try_files miss. Streamed rather than
 * read into memory — an app binary is tens of megabytes, not a quiz image.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename: raw } = await context.params
  const path = resolveDownloadPath(raw)
  if (!path) {
    return new NextResponse('Not Found', { status: 404 })
  }

  let info
  try {
    info = await stat(path)
  } catch {
    return new NextResponse('Not Found', { status: 404 })
  }
  if (!info.isFile()) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const mime = DOWNLOAD_MIME[extname(raw).toLowerCase()] || 'application/octet-stream'
  const body = Readable.toWeb(createReadStream(path)) as ReadableStream

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(info.size),
      'Content-Disposition': `attachment; filename="${raw}"`,
      'X-Content-Type-Options': 'nosniff',
      // Short, not immutable: a new release usually reuses the file name, and
      // a month-long cache would hand people yesterday's build.
      'Cache-Control': 'public, max-age=300',
    },
  })
}

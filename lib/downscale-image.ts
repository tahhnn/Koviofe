'use client'

/**
 * Shrinks an image in the browser before it is uploaded.
 *
 * The upload path stores whatever bytes it is given, and those bytes are then
 * fetched by the projector and by every player's phone at the start of a
 * round. A 2MB photo straight off a camera is therefore not one 2MB transfer
 * but one per person in the room, over whatever the venue's mobile signal is.
 * Resizing here costs the host nothing and is the only place the file can be
 * made smaller without re-encoding it on the server.
 *
 * Returns the original File untouched when it is already small enough, when
 * the format should not be re-encoded, or when anything fails: a host whose
 * browser cannot do this must still be able to upload.
 */

/** Long edge, in pixels. 1920 is the projector's own width. */
const MAX_EDGE = 1920

/** Below this, re-encoding usually makes the file bigger, not smaller. */
const SKIP_UNDER_BYTES = 300 * 1024

export async function downscaleImage(file: File): Promise<File> {
  // An animated GIF re-encodes to a single still frame, which silently
  // destroys what the host chose. Leave it alone; the size guard still applies.
  if (file.type === 'image/gif') return file
  if (file.size <= SKIP_UNDER_BYTES) return file
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
    if (scale >= 1) {
      // Already within the target. Re-encoding a photo that is merely heavy
      // (a 1600px JPEG at quality 100) is still worth it, so fall through
      // rather than returning, but keep the pixels.
      bitmap.close?.()
      return await reencode(file, width, height)
    }

    const out = await draw(bitmap, Math.round(width * scale), Math.round(height * scale), file.type)
    bitmap.close?.()
    return out ?? file
  } catch {
    return file
  }
}

async function reencode(file: File, width: number, height: number): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const out = await draw(bitmap, width, height, file.type)
    bitmap.close?.()
    // Only keep the result if it actually saved something.
    return out && out.size < file.size ? out : file
  } catch {
    return file
  }
}

async function draw(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  sourceType: string
): Promise<File | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, width, height)

  // PNG is kept only when the image actually uses transparency — that is the
  // one thing JPEG cannot carry, and it is what a logo needs. Keeping every
  // PNG as PNG instead would leave a photograph exported as PNG just as heavy
  // after the resize as before it, which is the case this whole function
  // exists to fix.
  const type = sourceType === 'image/png' && hasTransparency(ctx, width, height)
    ? 'image/png'
    : 'image/jpeg'

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, type === 'image/png' ? undefined : 0.85)
  )
  if (!blob) return null

  const name = renameFor(type)
  return new File([blob], name, { type })
}

/**
 * Reports whether any pixel is not fully opaque.
 *
 * Sampled on a grid rather than read pixel by pixel: a full 1920x1080 readback
 * is 8MB of ImageData, and a logo's transparency is never confined to a few
 * scattered pixels — it is the whole area around the mark. A stride of 4 finds
 * it and costs a sixteenth of the work.
 *
 * Returns true when the check cannot run: a canvas tainted by a cross-origin
 * source throws here, and in that case keeping PNG is the lossless choice.
 */
function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, width, height)
    const stride = 4 * 4 // every 4th pixel
    for (let i = 3; i < data.length; i += stride) {
      if (data[i] < 255) return true
    }
    return false
  } catch {
    return true
  }
}

function renameFor(type: string): string {
  return type === 'image/png' ? 'kv.png' : 'kv.jpg'
}

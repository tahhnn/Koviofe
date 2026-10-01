/**
 * Reads an image's pixel dimensions from its header bytes.
 *
 * Deliberately dependency-free. The alternative is `sharp`, which would have
 * to be added as a direct dependency: it is a native module, this project's
 * Dockerfile pins pnpm and disables dependency build scripts (see the comments
 * there), and the only thing the upload path actually needs is "how big is
 * this, in pixels" — which every one of the four accepted formats states in
 * its first few dozen bytes.
 *
 * Returns null when the dimensions cannot be read. Callers treat that as
 * "unknown", not "invalid": the format sniffing has already run, and an image
 * this cannot measure is far more likely to be an unusual-but-valid file than
 * an attack.
 */
export interface Dimensions {
  width: number
  height: number
}

export function readImageDimensions(buf: Buffer): Dimensions | null {
  if (buf.length < 16) return null

  // PNG: IHDR is always the first chunk, so width/height sit at a fixed offset.
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
    if (buf.length < 24) return null
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }

  // GIF: logical screen descriptor, little-endian, right after the signature.
  if (buf.toString('ascii', 0, 3) === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }

  // WebP: three container variants, each storing the size differently.
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fourCC = buf.toString('ascii', 12, 16)
    if (fourCC === 'VP8 ' && buf.length >= 30) {
      // Lossy: 14-byte frame header, then 14-bit width and height.
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    }
    if (fourCC === 'VP8L' && buf.length >= 25) {
      // Lossless: 14 bits each, packed across four bytes after the signature.
      const bits = buf.readUInt32LE(21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (fourCC === 'VP8X' && buf.length >= 30) {
      // Extended: 24-bit little-endian, stored as size minus one.
      const w = buf[24] | (buf[25] << 8) | (buf[26] << 16)
      const h = buf[27] | (buf[28] << 8) | (buf[29] << 16)
      return { width: w + 1, height: h + 1 }
    }
    return null
  }

  // JPEG: no fixed offset. Walk the marker segments to the frame header, which
  // is the only place the size appears.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        // Not on a marker boundary; the file is malformed or uses fill bytes
        // this walk does not model. Give up rather than guess.
        return null
      }
      const marker = buf[offset + 1]

      // Standalone markers carry no length field.
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
        offset += 2
        continue
      }
      // Start-of-scan: the entropy-coded data begins, and any frame header
      // would already have been seen.
      if (marker === 0xda) return null

      const length = buf.readUInt16BE(offset + 2)
      if (length < 2) return null

      // SOF0-SOF15, excluding the four that are not frame headers (DHT, JPG,
      // DAC, and the restart range handled above).
      const isFrameHeader =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isFrameHeader) {
        // Segment layout: length(2) precision(1) height(2) width(2)
        return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) }
      }

      offset += 2 + length
    }
    return null
  }

  return null
}

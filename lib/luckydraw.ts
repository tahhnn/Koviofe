import { readdir, readFile, stat } from 'fs/promises'
import { basename, extname, join } from 'path'

/**
 * Where the LuckyDraw companion app builds live and how they are described.
 *
 * The binaries are not part of the frontend image: they sit in the shared
 * uploads volume under `apps/`, so a new release is a file drop plus nothing —
 * no rebuild, no redeploy. Everything the dashboard shows (name, version,
 * platform, architecture, which variants exist) is derived from that directory
 * at request time rather than hardcoded in the page.
 *
 * The backend's orphaned-upload sweep skips directories, so files parked in
 * this subdirectory are never collected by it.
 */

export type LuckyDrawPlatform = 'windows' | 'macos' | 'android' | 'ios' | 'other'

/** CPU the build targets, when the file name says so. */
export type LuckyDrawArch = 'x64' | 'arm64' | 'x86'

/** What kind of artifact it is — an installer and a portable build of the
 *  same version are the same app but a different thing to click. */
export type LuckyDrawKind = 'installer' | 'diskImage' | 'portable' | 'portableArchive' | 'archive'

export type LuckyDrawBuild = {
  fileName: string
  /** Public download path — served by nginx from the volume, by Next in dev. */
  url: string
  platform: LuckyDrawPlatform
  arch?: LuckyDrawArch
  kind: LuckyDrawKind
  sizeBytes: number
  /** ISO timestamp of the file's mtime, i.e. when this build was published. */
  updatedAt: string
  version?: string
  /** Free-text label from app.json, shown instead of the derived one. */
  label?: string
  notes?: string
}

export type LuckyDrawRelease = {
  available: boolean
  appName?: string
  version?: string
  notes?: string
  /** Optional external page (store listing, changelog) set in app.json. */
  homepage?: string
  builds: LuckyDrawBuild[]
}

/** Extensions a person can actually install or run. */
const KNOWN_EXT = new Set(['.exe', '.msi', '.dmg', '.pkg', '.zip', '.apk', '.ipa'])

/** Content types for the Next fallback route; nginx has its own mime table. */
export const DOWNLOAD_MIME: Record<string, string> = {
  '.apk': 'application/vnd.android.package-archive',
  '.ipa': 'application/octet-stream',
  '.exe': 'application/octet-stream',
  '.msi': 'application/octet-stream',
  '.dmg': 'application/octet-stream',
  '.pkg': 'application/octet-stream',
  '.zip': 'application/zip',
}

/** Desktop first: this is a desktop app. Mobile entries are here so a future
 *  phone build lands somewhere sensible without a code change. */
const PLATFORM_ORDER: LuckyDrawPlatform[] = ['windows', 'macos', 'android', 'ios', 'other']

/** An installer is what most people want; the portable variants follow it. */
const KIND_ORDER: LuckyDrawKind[] = ['installer', 'diskImage', 'portable', 'portableArchive', 'archive']

type ManifestFile = {
  platform?: LuckyDrawPlatform
  arch?: LuckyDrawArch
  kind?: LuckyDrawKind
  label?: string
  version?: string
  notes?: string
}

type AppManifest = {
  name?: string
  version?: string
  notes?: string
  homepage?: string
  /** Per-file overrides, keyed by file name — the escape hatch for anything
   *  the name-based guesses below get wrong. */
  files?: Record<string, ManifestFile>
}

export function luckyDrawDir(): string {
  const explicit = process.env.LUCKYDRAW_DIR
  if (explicit) return explicit
  const uploads = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
  return join(uploads, 'apps')
}

function downloadBase(): string {
  return (process.env.LUCKYDRAW_DOWNLOAD_BASE || '/uploads/apps').replace(/\/$/, '')
}

export function isDownloadableFile(name: string): boolean {
  return KNOWN_EXT.has(extname(name).toLowerCase())
}

/**
 * Which OS a file is for.
 *
 * The extension decides it outright except for .zip, which every platform
 * uses. There the name has to say: a mac hint wins, otherwise a zip sitting
 * next to .exe builds is the Windows portable one (electron-builder names it
 * "Portable"), and anything else is left unclassified rather than guessed.
 */
function platformFor(name: string): LuckyDrawPlatform {
  const ext = extname(name).toLowerCase()
  const lower = name.toLowerCase()

  switch (ext) {
    case '.exe':
    case '.msi':
      return 'windows'
    case '.dmg':
    case '.pkg':
      return 'macos'
    case '.apk':
      return 'android'
    case '.ipa':
      return 'ios'
    case '.zip':
      if (/mac|darwin|osx/.test(lower)) return 'macos'
      if (/win|portable/.test(lower)) return 'windows'
      return 'other'
    default:
      return 'other'
  }
}

function archFor(name: string): LuckyDrawArch | undefined {
  const lower = name.toLowerCase()
  if (/arm64|aarch64|apple[-_.]?silicon/.test(lower)) return 'arm64'
  if (/x64|x86[-_]?64|amd64/.test(lower)) return 'x64'
  if (/ia32|x86|win32/.test(lower)) return 'x86'
  return undefined
}

function kindFor(name: string): LuckyDrawKind {
  const ext = extname(name).toLowerCase()
  const portable = /portable/.test(name.toLowerCase())
  if (ext === '.dmg' || ext === '.pkg') return 'diskImage'
  // A portable .exe and a portable .zip of the same version ship side by side;
  // collapsing both to "portable" would leave two rows a reader cannot tell
  // apart without squinting at the file name.
  if (ext === '.zip') return portable ? 'portableArchive' : 'archive'
  if (portable) return 'portable'
  return 'installer' // .exe/.msi/.apk/.ipa: double-click and it installs
}

/**
 * Pulls a version out of a build name — "GachaDraw-1.0.0-arm64.dmg" → 1.0.0.
 *
 * The pre-release suffix is matched by name (beta, rc…) rather than as "any
 * trailing token": in these file names what follows the version is the CPU and
 * the extension, and a greedy suffix swallowed both ("1.0.0-arm64.dmg").
 */
function versionFor(name: string): string | undefined {
  const match = /(\d+\.\d+(?:\.\d+)?)(?:[-+](?:alpha|beta|rc|dev|preview|next)[0-9A-Za-z.]*)?/i.exec(name)
  return match?.[0]
}

/**
 * Resolves a requested download to a path inside the app directory, or null.
 * Same shape of check as the image route: the name must survive basename()
 * unchanged, so no traversal and no nested path can get through.
 */
export function resolveDownloadPath(raw: string): string | null {
  const name = basename(raw || '')
  if (!name || name !== raw || name.includes('..')) return null
  if (!isDownloadableFile(name)) return null
  return join(luckyDrawDir(), name)
}

async function readManifest(dir: string): Promise<AppManifest> {
  try {
    const raw = await readFile(join(dir, 'app.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as AppManifest) : {}
  } catch {
    // No manifest is a supported case: the file names carry enough on their own.
    return {}
  }
}

export async function readLuckyDrawRelease(): Promise<LuckyDrawRelease> {
  const dir = luckyDrawDir()

  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return { available: false, builds: [] } // nothing uploaded yet
  }

  const manifest = await readManifest(dir)
  const base = downloadBase()
  const builds: LuckyDrawBuild[] = []

  for (const name of names) {
    if (!isDownloadableFile(name)) continue
    let info
    try {
      info = await stat(join(dir, name))
    } catch {
      continue
    }
    if (!info.isFile()) continue

    const override = manifest.files?.[name]
    builds.push({
      fileName: name,
      url: `${base}/${encodeURIComponent(name)}`,
      platform: override?.platform ?? platformFor(name),
      arch: override?.arch ?? archFor(name),
      kind: override?.kind ?? kindFor(name),
      sizeBytes: info.size,
      updatedAt: info.mtime.toISOString(),
      version: override?.version ?? manifest.version ?? versionFor(name),
      label: override?.label,
      notes: override?.notes,
    })
  }

  builds.sort((a, b) => {
    const byPlatform = PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform)
    if (byPlatform !== 0) return byPlatform
    const byKind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    if (byKind !== 0) return byKind
    // Same platform and same kind means the two differ by CPU (x64 / arm64):
    // alphabetical keeps that pair in a stable order between requests.
    return a.fileName.localeCompare(b.fileName)
  })

  return {
    available: builds.length > 0,
    appName: manifest.name,
    version: manifest.version ?? builds.map((b) => b.version).find(Boolean),
    notes: manifest.notes,
    homepage: manifest.homepage,
    builds,
  }
}

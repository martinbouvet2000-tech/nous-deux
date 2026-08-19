import { supabase } from '@/lib/supabase'

/** Bucket Storage privé des vlogs */
export const VLOG_BUCKET = 'vlogs'
/** Durée de validité d'une URL signée (secondes) */
const SIGNED_TTL = 3600
/** Marge avant expiration : on re-signe un peu avant la fin */
const SAFETY_MS = 60_000

const cache = new Map<string, { url: string; expires: number }>()

function fresh(path: string): string | null {
  const hit = cache.get(path)
  if (hit && hit.expires > Date.now() + SAFETY_MS) return hit.url
  return null
}

/** URLs signées pour un lot de chemins (cache mémoire ~1 h). Renvoie path → url. */
export async function getSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const missing: string[] = []
  for (const p of paths) {
    const u = fresh(p)
    if (u) out.set(p, u)
    else if (!missing.includes(p)) missing.push(p)
  }
  if (missing.length === 0) return out

  const { data, error } = await supabase.storage.from(VLOG_BUCKET).createSignedUrls(missing, SIGNED_TTL)
  if (error || !data) {
    console.error('[vlogMedia] createSignedUrls', error)
    return out
  }
  const expires = Date.now() + SIGNED_TTL * 1000
  data.forEach((item, i) => {
    // L'ordre de réponse suit l'ordre de la requête ; `path` peut être null en cas d'échec unitaire
    const path = item.path ?? missing[i]
    if (item.signedUrl && path) {
      cache.set(path, { url: item.signedUrl, expires })
      out.set(path, item.signedUrl)
    }
  })
  return out
}

/** URL signée pour un seul chemin (cache mémoire) */
export async function getSignedUrl(path: string): Promise<string | null> {
  const hit = fresh(path)
  if (hit) return hit
  const { data, error } = await supabase.storage.from(VLOG_BUCKET).createSignedUrl(path, SIGNED_TTL)
  if (error || !data?.signedUrl) {
    console.error('[vlogMedia] createSignedUrl', error)
    return null
  }
  cache.set(path, { url: data.signedUrl, expires: Date.now() + SIGNED_TTL * 1000 })
  return data.signedUrl
}

/** À appeler après suppression d'un média */
export function forgetSignedUrl(path: string) {
  cache.delete(path)
}

/** Taille max acceptée par le bucket (50 Mo) */
export const VLOG_MAX_BYTES = 50 * 1024 * 1024

/** Extension normalisée à partir du type MIME / nom de fichier */
export function extensionFor(file: File): string {
  const byMime: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  }
  if (byMime[file.type]) return byMime[file.type]
  const m = /\.([a-z0-9]+)$/i.exec(file.name)
  return (m?.[1] ?? 'bin').toLowerCase()
}

/**
 * Compression côté client des images : côté max 1600 px, JPEG qualité 0,82.
 * Les GIF sont renvoyés tels quels (animation). Si le décodage échoue (HEIC, etc.), on renvoie le fichier d'origine.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  if (file.type === 'image/gif') return file
  let bitmap: ImageBitmap | HTMLImageElement
  try {
    bitmap = await loadBitmap(file)
  } catch {
    return file
  }
  const w = bitmap.width, h = bitmap.height
  if (!w || !h) return file
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const tw = Math.round(w * scale), th = Math.round(h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = tw; canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, tw, th)
  if ('close' in bitmap) bitmap.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
  if (!blob) return file
  // On ne garde la version compressée que si elle est réellement plus légère ou si le format d'origine n'est pas lisible partout
  if (blob.size >= file.size && file.type !== 'image/heic') return file
  const base = file.name.replace(/\.[a-z0-9]+$/i, '') || 'photo'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* fallback <img> ci-dessous */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')) }
    img.src = url
  })
}

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Clapperboard, ImagePlus, Play, X } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Vlog } from '@/types/database'
import Modal from '@/components/ui/Modal'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL } from '@/lib/ui'
import { VLOG_BUCKET, VLOG_MAX_BYTES, compressImage, extensionFor } from '@/lib/vlogMedia'

const CAPTION_MAX = 500

interface Props {
  onClose: () => void
  /** Appelé avec la ligne insérée, pour l'ajouter au feed sans recharger */
  onPublished: (vlog: Vlog) => void
}

type Phase = 'idle' | 'compress' | 'upload' | 'save'

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Publier',
  compress: 'Préparation…',
  upload: 'Envoi…',
  save: 'Enregistrement…',
}

/** Modale d'ajout d'un vlog : photo ou courte vidéo + légende + date */
export default function VlogComposer({ onClose, onPublished }: Props) {
  const { profile } = useAuthStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [takenAt, setTakenAt] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [phase, setPhase] = useState<Phase>('idle')
  const busy = phase !== 'idle'

  const isVideo = !!file && file.type.startsWith('video/')

  // Aperçu local (object URL), libéré à chaque changement de fichier
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) return
    const video = f.type.startsWith('video/')
    const image = f.type.startsWith('image/')
    if (!video && !image) {
      toast.error('Choisis une photo ou une vidéo.')
      e.target.value = ''
      return
    }
    if (video && f.size > VLOG_MAX_BYTES) {
      toast.error(`Cette vidéo fait ${(f.size / 1024 / 1024).toFixed(0)} Mo — la limite est de 50 Mo. Essaie une version plus courte.`)
      e.target.value = ''
      return
    }
    setFile(f)
  }

  const clearFile = () => {
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const publish = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile || !file || busy) return
    const media_type: Vlog['media_type'] = isVideo ? 'video' : 'image'

    // 1. Préparation (compression des images)
    setPhase('compress')
    let payload = file
    if (media_type === 'image') {
      try { payload = await compressImage(file) } catch { payload = file }
    }
    if (payload.size > VLOG_MAX_BYTES) {
      toast.error('Le fichier dépasse 50 Mo.')
      setPhase('idle')
      return
    }

    // 2. Upload dans le bucket privé : `${auth.uid()}/${uuid}.${ext}` (imposé par la RLS storage)
    setPhase('upload')
    const path = `${profile.id}/${crypto.randomUUID()}.${extensionFor(payload)}`
    const up = await run(
      supabase.storage.from(VLOG_BUCKET).upload(path, payload, { contentType: payload.type || undefined, upsert: false }),
      { errorMessage: "L'envoi du média a échoué. Vérifie ta connexion et réessaie." },
    )
    if (!up.ok) { setPhase('idle'); return }

    // 3. Ligne en base
    setPhase('save')
    const taken = takenAt ? new Date(takenAt) : new Date()
    const { ok, data } = await run(
      supabase
        .from('vlogs')
        .insert({ author_id: profile.id, media_path: path, media_type, caption: caption.trim() || null, taken_at: (isNaN(taken.getTime()) ? new Date() : taken).toISOString() })
        .select('*')
        .single(),
      { errorMessage: "Le vlog n'a pas pu être publié." },
    )
    if (!ok || !data) {
      // On ne laisse pas de fichier orphelin
      await supabase.storage.from(VLOG_BUCKET).remove([path])
      setPhase('idle')
      return
    }
    toast.success('Publié')
    onPublished(data as Vlog)
    onClose()
  }

  return (
    <Modal title="Nouveau vlog" description="Une photo ou une courte vidéo, un mot — l'autre le voit en direct." onClose={busy ? () => {} : onClose}>
      <form onSubmit={publish} className="space-y-4">
        {/* Média */}
        <div>
          <span className={LABEL} id="vlog-media-label">Photo ou vidéo</span>
          <input
            ref={inputRef}
            id="vlog-file"
            type="file"
            accept="image/*,video/*"
            onChange={pickFile}
            className="sr-only"
            aria-labelledby="vlog-media-label"
            disabled={busy}
          />
          {!file ? (
            <label
              htmlFor="vlog-file"
              className="flex flex-col items-center justify-center gap-2 min-h-[160px] rounded-xl cursor-pointer bg-white/[0.03] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.07)] [border:1px_dashed_rgba(240,234,224,0.10)] hover:bg-white/[0.05] transition-colors duration-200 text-center px-4"
            >
              <span className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-[#D4A574]/15 to-[#C2788E]/15 text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.22)]" aria-hidden="true">
                <ImagePlus size={18} />
              </span>
              <span className="text-sm text-[#F0EAE0]">Choisir un fichier</span>
              <span className="text-xs text-[#9B9287]">JPEG, PNG, WebP, HEIC, GIF · MP4, MOV, WebM · 50 Mo max</span>
            </label>
          ) : (
            <div className="relative overflow-hidden rounded-xl bg-black/40 shadow-[inset_0_0_0_1px_rgba(240,234,224,0.07)]">
              {previewUrl && (
                isVideo ? (
                  <video src={previewUrl} className="w-full max-h-[300px] object-contain" controls playsInline preload="metadata" />
                ) : (
                  <img src={previewUrl} alt="" className="w-full max-h-[300px] object-contain" />
                )
              )}
              <button
                type="button"
                onClick={clearFile}
                disabled={busy}
                className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-[#110F0E]/70 text-[#F0EAE0] hover:bg-[#110F0E]/90 transition-colors duration-200"
                aria-label="Retirer le fichier"
              >
                <X size={15} aria-hidden="true" />
              </button>
              <p className="px-3 py-2 text-xs text-[#9B9287] truncate flex items-center gap-1.5">
                {isVideo ? <Play size={11} aria-hidden="true" /> : <Clapperboard size={11} aria-hidden="true" />}
                <span className="truncate">{file.name}</span>
                <span className="num shrink-0">· {(file.size / 1024 / 1024).toFixed(1)} Mo</span>
              </p>
            </div>
          )}
          {isVideo && <p className="mt-2 text-xs text-[#9B9287]">Conseil : ≤ 60 s, c'est mieux — plus léger à envoyer, plus agréable à regarder.</p>}
        </div>

        {/* Légende */}
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="vlog-caption" className={LABEL}>Légende (optionnel)</label>
            <span className="text-[11px] text-[#9B9287] num" aria-live="polite">{caption.length}/{CAPTION_MAX}</span>
          </div>
          <textarea
            id="vlog-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
            rows={3}
            maxLength={CAPTION_MAX}
            className={`${INPUT} resize-none`}
            placeholder="Ce que tu voulais lui montrer…"
            disabled={busy}
          />
        </div>

        {/* Date / heure */}
        <div>
          <label htmlFor="vlog-taken-at" className={LABEL}>Date et heure</label>
          <input
            id="vlog-taken-at"
            type="datetime-local"
            value={takenAt}
            onChange={(e) => setTakenAt(e.target.value)}
            className={INPUT}
            required
            lang="fr-FR"
            disabled={busy}
          />
        </div>

        {busy && (
          <div className="rounded-xl bg-white/[0.03] px-4 py-3" role="status" aria-live="polite">
            <div className="flex items-center justify-between text-xs text-[#9B9287]">
              <span>{PHASE_LABEL[phase]}</span>
              <span className="num">{phase === 'compress' ? '1/3' : phase === 'upload' ? '2/3' : '3/3'}</span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#D4A574] to-[#C2788E] transition-all duration-500 ease-out motion-reduce:transition-none"
                style={{ width: phase === 'compress' ? '25%' : phase === 'upload' ? '65%' : '92%' }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`${BTN_GHOST} flex-1`} disabled={busy}>Annuler</button>
          <button type="submit" disabled={busy || !file} className={`${BTN_PRIMARY} flex-1`}>{PHASE_LABEL[phase]}</button>
        </div>
      </form>
    </Modal>
  )
}

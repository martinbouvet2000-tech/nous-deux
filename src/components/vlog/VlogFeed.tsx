import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard, Film, Play, Trash2, Plus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Vlog } from '@/types/database'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import VlogComposer from '@/components/vlog/VlogComposer'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { shine, unshine } from '@/lib/shine'
import { BTN_GHOST, BTN_PRIMARY, CARD_EDGE, EYEBROW } from '@/lib/ui'
import { VLOG_BUCKET, forgetSignedUrl, getSignedUrls } from '@/lib/vlogMedia'

const PAGE_SIZE = 24

interface Props {
  composerOpen: boolean
  onOpenComposer: () => void
  onCloseComposer: () => void
}

/** Tri : du plus récent au plus ancien (taken_at, puis created_at) */
const byRecency = (a: Vlog, b: Vlog) =>
  b.taken_at.localeCompare(a.taken_at) || b.created_at.localeCompare(a.created_at)

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Frise chronologique des vlogs, groupée par mois, temps réel avec le/la partenaire */
export default function VlogFeed({ composerOpen, onOpenComposer, onCloseComposer }: Props) {
  const { profile, partnerProfile } = useAuthStore()
  const [vlogs, setVlogs] = useState<Vlog[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Vlog | null>(null)
  const [deleting, setDeleting] = useState(false)
  const offsetRef = useRef(0)
  /** Miroir synchrone de la liste pour les handlers temps réel (dédoublonnage) */
  const vlogsRef = useRef<Vlog[]>([])
  useEffect(() => { vlogsRef.current = vlogs }, [vlogs])

  const myName = profile?.display_name ?? 'Moi'
  const partnerName = partnerProfile?.display_name ?? 'ton/ta partenaire'

  /** Signe les URLs manquantes et les fusionne dans l'état */
  const signFor = useCallback(async (items: Vlog[]) => {
    const paths = items.map((v) => v.media_path)
    if (paths.length === 0) return
    const m = await getSignedUrls(paths)
    if (m.size === 0) return
    setUrls((prev) => {
      const next = new Map(prev)
      m.forEach((u, p) => next.set(p, u))
      return next
    })
  }, [])
  // Les URLs signées expirent (~1 h) : on les renouvelle périodiquement et au retour sur l'onglet
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') void signFor(vlogsRef.current) }
    const t = setInterval(refresh, 10 * 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', refresh) }
  }, [signFor])

  /** Ajoute sans doublon, en conservant l'ordre chronologique */
  const upsert = useCallback((incoming: Vlog[]) => {
    setVlogs((prev) => {
      const seen = new Set(prev.map((v) => v.id))
      const fresh = incoming.filter((v) => !seen.has(v.id))
      if (fresh.length === 0) return prev
      return [...prev, ...fresh].sort(byRecency)
    })
  }, [])

  const fetchPage = useCallback(async (offset: number) => {
    const { ok, data } = await run<Vlog[]>(
      supabase
        .from('vlogs')
        .select('*')
        .order('taken_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1),
      { errorMessage: 'Impossible de charger le vlog.' },
    )
    if (!ok || !data) return
    offsetRef.current = offset + data.length
    setHasMore(data.length === PAGE_SIZE)
    upsert(data)
    void signFor(data)
  }, [upsert, signFor])

  // Chargement initial
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPage(0).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fetchPage])

  // Temps réel : les vlogs du/de la partenaire arrivent et disparaissent sans recharger
  useEffect(() => {
    if (!profile?.id || !partnerProfile?.id) return
    const partnerId = partnerProfile.id
    const name = partnerProfile.display_name ?? 'ton/ta partenaire'
    const channel = supabase
      .channel(`vlogs:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vlogs', filter: `author_id=eq.${partnerId}` },
        (payload: RealtimePostgresChangesPayload<Vlog>) => {
          const row = payload.new as Vlog
          if (!row?.id || vlogsRef.current.some((v) => v.id === row.id)) return
          offsetRef.current += 1
          upsert([row])
          void signFor([row])
          toast.info(`Nouveau vlog de ${name}`)
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'vlogs', filter: `author_id=eq.${partnerId}` },
        (payload: RealtimePostgresChangesPayload<Vlog>) => {
          const id = (payload.old as Partial<Vlog>)?.id
          if (!id) return
          setVlogs((prev) => {
            if (!prev.some((v) => v.id === id)) return prev
            offsetRef.current = Math.max(0, offsetRef.current - 1)
            return prev.filter((v) => v.id !== id)
          })
          setSelected((s) => (s?.id === id ? null : s))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, partnerProfile?.id, partnerProfile?.display_name, signFor, upsert])

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    await fetchPage(offsetRef.current)
    setLoadingMore(false)
  }

  const onPublished = (v: Vlog) => {
    offsetRef.current += 1
    upsert([v])
    void signFor([v])
  }

  const remove = async (v: Vlog) => {
    if (v.author_id !== profile?.id || deleting) return
    const yes = await confirm({
      title: 'Supprimer ce vlog ?',
      message: 'Il disparaîtra pour vous deux, et le média sera effacé.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!yes) return
    setDeleting(true)
    const { ok } = await run(supabase.from('vlogs').delete().eq('id', v.id), { errorMessage: 'Suppression impossible.' })
    if (ok) {
      const { error } = await supabase.storage.from(VLOG_BUCKET).remove([v.media_path])
      if (error) console.error('[vlog] storage remove', error)
      forgetSignedUrl(v.media_path)
      offsetRef.current = Math.max(0, offsetRef.current - 1)
      setVlogs((prev) => prev.filter((x) => x.id !== v.id))
      setSelected(null)
      toast.success('Vlog supprimé')
    }
    setDeleting(false)
  }

  /* Regroupement par mois (la liste est déjà triée du plus récent au plus ancien) */
  const byMonth = useMemo(
    () =>
      vlogs.reduce<{ key: string; label: string; items: Vlog[] }[]>((acc, v) => {
        const d = parseISO(v.taken_at)
        const key = format(d, 'yyyy-MM')
        const last = acc[acc.length - 1]
        if (last && last.key === key) last.items.push(v)
        else acc.push({ key, label: capitalize(format(d, 'LLLL yyyy', { locale: fr })), items: [v] })
        return acc
      }, []),
    [vlogs],
  )

  return (
    <>
      {loading ? (
        <Skeleton />
      ) : vlogs.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="Votre vlog commence ici"
          text={
            partnerProfile
              ? "Une photo, une courte vidéo, un mot — et l'autre le voit en direct."
              : "Une photo, une courte vidéo, un mot. Lie ton/ta partenaire pour qu'il ou elle le voie en direct."
          }
          action={
            <button onClick={onOpenComposer} className={BTN_PRIMARY}>
              <Plus size={14} aria-hidden="true" /> Ajouter un vlog
            </button>
          }
        />
      ) : (
        <div className="space-y-8">
          {byMonth.map(({ key, label, items }) => (
            <section key={key} aria-label={`Vlogs de ${label}`}>
              <div className="flex items-center gap-3 mb-4">
                <span className="h-px w-10 bg-gradient-to-r from-transparent to-[#D4A574]/30" aria-hidden="true" />
                <h2 className="font-display text-[17px] tracking-tight text-[#F0EAE0] num">{label}</h2>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#D4A574]/30" aria-hidden="true" />
              </div>
              <ul role="list" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {items.map((v) => (
                  <li key={v.id}>
                    <VlogCard vlog={v} url={urls.get(v.media_path)} isMine={v.author_id === profile?.id} authorName={v.author_id === profile?.id ? myName : partnerName} onOpen={() => setSelected(v)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {hasMore && (
            <div className="flex justify-center">
              <button onClick={loadMore} disabled={loadingMore} className={BTN_GHOST}>
                {loadingMore ? 'Chargement…' : 'Voir plus'}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-[14px] bg-white/[0.03] px-4 py-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.04] text-[#D4A574]" aria-hidden="true">
              <Film size={16} />
            </span>
            <p className="text-[13px] text-[#9B9287] leading-relaxed">
              <span className="text-[#F0EAE0]">Rétrospective de l'année</span> — bientôt : en décembre, Awy assemblera vos vlogs en un film souvenir.
            </p>
          </div>
        </div>
      )}

      {selected && (
        <Lightbox
          vlog={selected}
          url={urls.get(selected.media_path)}
          isMine={selected.author_id === profile?.id}
          authorName={selected.author_id === profile?.id ? myName : partnerName}
          deleting={deleting}
          onDelete={() => remove(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {composerOpen && <VlogComposer onClose={onCloseComposer} onPublished={onPublished} />}
    </>
  )
}

/* ───────────────────────────── Carte ───────────────────────────── */

function AuthorChip({ name, mine }: { name: string; mine: boolean }) {
  return (
    <span
      className={`inline-flex items-center max-w-[50%] truncate rounded-full px-2.5 py-1 text-[11px] font-medium ${
        mine
          ? 'bg-[#D4A574]/12 text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.25)]'
          : 'bg-[#C2788E]/12 text-[#C2788E] shadow-[inset_0_0_0_1px_rgba(194,120,142,0.3)]'
      }`}
    >
      {name}
    </span>
  )
}

function VlogCard({ vlog, url, isMine, authorName, onOpen }: { vlog: Vlog; url?: string; isMine: boolean; authorName: string; onOpen: () => void }) {
  const d = parseISO(vlog.taken_at)
  const dateLabel = capitalize(format(d, 'EEEE d MMMM', { locale: fr }))
  const timeLabel = format(d, 'HH:mm')
  return (
    <article className="lux-card relative overflow-hidden rounded-[20px] transition-all duration-500 ease-out group h-full" onMouseMove={shine} onMouseLeave={unshine}>
      <div className={CARD_EDGE} aria-hidden="true" />
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left rounded-[20px] outline-none"
        aria-label={`Ouvrir le vlog de ${authorName} du ${dateLabel}${vlog.caption ? ` : ${vlog.caption}` : ''}`}
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-white/[0.03]">
          {url ? (
            vlog.media_type === 'video' ? (
              <video src={url} preload="metadata" playsInline muted className="h-full w-full object-cover" tabIndex={-1} />
            ) : (
              <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
            )
          ) : (
            <div className="h-full w-full animate-pulse bg-white/[0.04]" />
          )}
          {vlog.media_type === 'video' && (
            <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
              <span className="grid size-12 place-items-center rounded-full bg-[#110F0E]/60 text-[#F0EAE0] backdrop-blur-sm shadow-[inset_0_0_0_1px_rgba(240,234,224,0.15)]">
                <Play size={18} className="translate-x-px" fill="currentColor" />
              </span>
            </span>
          )}
        </div>
        <div className="p-4 space-y-3">
          {vlog.caption ? (
            <p className="text-[14px] text-[#F0EAE0] leading-snug line-clamp-2">{vlog.caption}</p>
          ) : (
            <p className="text-[14px] text-[#9B9287] font-display-italic leading-snug">Sans légende</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <AuthorChip name={authorName} mine={isMine} />
            <p className="text-xs text-[#9B9287] truncate">
              {dateLabel} · <span className="num">{timeLabel}</span>
            </p>
          </div>
        </div>
      </button>
    </article>
  )
}

/* ───────────────────────────── Lightbox ───────────────────────────── */

function Lightbox({ vlog, url, isMine, authorName, deleting, onDelete, onClose }: { vlog: Vlog; url?: string; isMine: boolean; authorName: string; deleting: boolean; onDelete: () => void; onClose: () => void }) {
  const d = parseISO(vlog.taken_at)
  const dateLabel = capitalize(format(d, 'EEEE d MMMM yyyy', { locale: fr }))
  return (
    <Modal title={`Vlog de ${authorName}`} description={`${dateLabel} · ${format(d, 'HH:mm')}`} onClose={onClose}>
      <div className="-mx-1 overflow-hidden rounded-[14px] bg-black/40 shadow-[inset_0_0_0_1px_rgba(240,234,224,0.07)]">
        {url ? (
          vlog.media_type === 'video' ? (
            <video src={url} controls playsInline preload="metadata" autoPlay className="w-full max-h-[60dvh] object-contain" />
          ) : (
            <img src={url} alt={vlog.caption ?? `Vlog de ${authorName}`} className="w-full max-h-[60dvh] object-contain" />
          )
        ) : (
          <div className="aspect-[3/4] w-full animate-pulse bg-white/[0.04]" />
        )}
      </div>
      {vlog.caption && <p className="text-sm text-[#F0EAE0] leading-relaxed whitespace-pre-wrap">{vlog.caption}</p>}
      <div className="flex items-center justify-between gap-3 pt-1">
        <AuthorChip name={authorName} mine={isMine} />
        {isMine && (
          <button type="button" onClick={onDelete} disabled={deleting} className="btn-tertiary !text-[#F0A5AD] disabled:opacity-60">
            <Trash2 size={13} aria-hidden="true" /> {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
        )}
      </div>
    </Modal>
  )
}

/* ───────────────────────────── Squelette ───────────────────────────── */

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement du vlog">
      <div className="flex items-center gap-3">
        <span className="h-px w-10 bg-white/[0.06]" />
        <span className={`${EYEBROW} h-3 w-24 rounded bg-white/[0.04] animate-pulse`} />
        <span className="h-px flex-1 bg-white/[0.06]" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-[20px] overflow-hidden bg-white/[0.03]">
            <div className="aspect-[3/4] bg-white/[0.04] animate-pulse" />
            <div className="p-4 space-y-3">
              <div className="h-3.5 w-4/5 rounded bg-white/[0.04] animate-pulse" />
              <div className="h-3.5 w-3/5 rounded bg-white/[0.04] animate-pulse" />
              <div className="flex items-center justify-between">
                <div className="h-6 w-16 rounded-full bg-white/[0.04] animate-pulse" />
                <div className="h-3 w-24 rounded bg-white/[0.04] animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Clapperboard, Film, Play, Trash2, Plus, Loader2, ImageOff, RotateCw, Star } from 'lucide-react'
import { parseISO } from 'date-fns'
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
import {
  capitalizeFirst, formatDayMonthFR, formatDayMonthShortFR, formatLongDateFR, formatMonthYearFR,
} from '@/lib/dates'
import { formatTimeIn, zonedCivilDate, zonedDateKey } from '@/lib/timezone'
import { resolveTimezone } from '@/lib/today'
import { VLOG_BUCKET, forgetSignedUrl, getSignedUrls } from '@/lib/vlogMedia'

const PAGE_SIZE = 24

/** Filtre du fil : tout le quotidien, ou seulement les étapes marquées (l'ex « Notre histoire ») */
type Filter = 'all' | 'milestones'

interface Props {
  composerOpen: boolean
  onOpenComposer: () => void
  onCloseComposer: () => void
}

/** Tri : du plus récent au plus ancien (taken_at, puis created_at) */
const byRecency = (a: Vlog, b: Vlog) =>
  b.taken_at.localeCompare(a.taken_at) || b.created_at.localeCompare(a.created_at)

/** Frise chronologique des vlogs, groupée par mois, temps réel avec le/la partenaire */
export default function VlogFeed({ composerOpen, onOpenComposer, onCloseComposer }: Props) {
  const { profile, partnerProfile } = useAuthStore()
  // Toutes les dates et heures du fil se lisent dans TON fuseau (celui du profil) :
  // sinon l'accueil disait « 14:49 » et les souvenirs « 12:49 » pour le même vlog,
  // et un vlog du vendredi soir basculait au samedi dès que tu voyageais.
  const selfTz = resolveTimezone(profile?.timezone)
  const [vlogs, setVlogs] = useState<Vlog[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  /** Chemins dont la signature d'URL a échoué → on affiche l'état « Média indisponible » */
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Vlog | null>(null)
  const [deleting, setDeleting] = useState(false)
  /** Bascule « Étape » en cours (lightbox) */
  const [marking, setMarking] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
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
    if (m.size > 0) {
      setUrls((prev) => {
        const next = new Map(prev)
        m.forEach((u, p) => next.set(p, u))
        return next
      })
    }
    // Les chemins non résolus passent en échec (URL signée indisponible)
    setFailed((prev) => {
      let changed = false
      const next = new Set(prev)
      paths.forEach((p) => {
        if (m.has(p)) { if (next.delete(p)) changed = true }
        else if (!next.has(p)) { next.add(p); changed = true }
      })
      return changed ? next : prev
    })
  }, [])

  /** Réessai : on oublie l'URL en cache et on relance la signature pour ce vlog */
  const retryMedia = useCallback((v: Vlog) => {
    forgetSignedUrl(v.media_path)
    setUrls((prev) => {
      if (!prev.has(v.media_path)) return prev
      const next = new Map(prev)
      next.delete(v.media_path)
      return next
    })
    setFailed((prev) => {
      if (!prev.has(v.media_path)) return prev
      const next = new Set(prev)
      next.delete(v.media_path)
      return next
    })
    void signFor([v])
  }, [signFor])
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
        { event: 'UPDATE', schema: 'public', table: 'vlogs', filter: `author_id=eq.${partnerId}` },
        (payload: RealtimePostgresChangesPayload<Vlog>) => {
          // Le/la partenaire peut basculer « étape » après coup : on reflète le
          // changement sans recharger, sinon le badge ne bouge qu'au rechargement.
          const row = payload.new as Vlog
          if (!row?.id) return
          setVlogs((prev) => prev.map((v) => (v.id === row.id ? { ...v, ...row } : v)))
          setSelected((s) => (s?.id === row.id ? { ...s, ...row } : s))
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

  /**
   * Marque (ou démarque) un vlog comme étape importante, après coup.
   * Jusqu'ici c'était le seul réglage impossible à corriger : oublier de cocher la
   * case à la publication obligeait à supprimer le vlog pour le republier. Réservé
   * à l'auteur — la policy `vlogs update own` refuserait de toute façon les autres.
   */
  const toggleMilestone = async (v: Vlog) => {
    if (v.author_id !== profile?.id || marking) return
    const next = !v.is_milestone
    setMarking(true)
    const { ok } = await run(
      supabase.from('vlogs').update({ is_milestone: next }).eq('id', v.id),
      { errorMessage: "L'étape n'a pas pu être enregistrée." },
    )
    if (ok) {
      // Mise à jour locale : le badge et le filtre suivent sans recharger le fil.
      setVlogs((prev) => prev.map((x) => (x.id === v.id ? { ...x, is_milestone: next } : x)))
      setSelected((s) => (s?.id === v.id ? { ...s, is_milestone: next } : s))
      toast.success(next ? 'Marqué comme étape' : 'Ce n’est plus une étape')
    }
    setMarking(false)
  }

  const milestoneCount = useMemo(() => vlogs.filter((v) => v.is_milestone).length, [vlogs])

  /** Vlogs affichés selon le filtre actif (« Étapes » = seulement les moments marqués) */
  const visible = useMemo(
    () => (filter === 'milestones' ? vlogs.filter((v) => v.is_milestone) : vlogs),
    [vlogs, filter],
  )

  /* Regroupement par mois, dans TON fuseau (la liste est déjà triée du plus récent au plus ancien) */
  const byMonth = useMemo(
    () =>
      visible.reduce<{ key: string; label: string; items: Vlog[] }[]>((acc, v) => {
        const d = parseISO(v.taken_at)
        const key = zonedDateKey(selfTz, d).slice(0, 7)
        const last = acc[acc.length - 1]
        if (last && last.key === key) last.items.push(v)
        else acc.push({ key, label: capitalizeFirst(formatMonthYearFR(zonedCivilDate(selfTz, d))), items: [v] })
        return acc
      }, []),
    [visible, selfTz],
  )

  return (
    <>
      {loading ? (
        <Skeleton />
      ) : vlogs.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="Votre histoire commence ici"
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
          {/* Filtre : tout le quotidien, ou seulement les étapes marquées */}
          <div className="flex items-center gap-2" role="tablist" aria-label="Filtrer le vlog">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Tout</FilterChip>
            <FilterChip active={filter === 'milestones'} onClick={() => setFilter('milestones')} icon>
              Étapes{milestoneCount > 0 && <span className="num opacity-70"> · {milestoneCount}</span>}
            </FilterChip>
          </div>

          {filter === 'milestones' && byMonth.length === 0 ? (
            <EmptyState
              icon={Star}
              title="Aucune étape pour l'instant"
              text="Marque un vlog comme étape importante pour retrouver ici la frise de vos grands moments."
            />
          ) : (
            <>
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
                    <VlogCard vlog={v} tz={selfTz} url={urls.get(v.media_path)} signFailed={failed.has(v.media_path)} onRetry={() => retryMedia(v)} isMine={v.author_id === profile?.id} authorName={v.author_id === profile?.id ? myName : partnerName} onOpen={() => setSelected(v)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {hasMore && filter === 'all' && (
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
            </>
          )}
        </div>
      )}

      {selected && (
        <Lightbox
          vlog={selected}
          tz={selfTz}
          url={urls.get(selected.media_path)}
          signFailed={failed.has(selected.media_path)}
          onRetry={() => retryMedia(selected)}
          isMine={selected.author_id === profile?.id}
          authorName={selected.author_id === profile?.id ? myName : partnerName}
          deleting={deleting}
          onDelete={() => remove(selected)}
          marking={marking}
          onToggleMilestone={() => toggleMilestone(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {composerOpen && <VlogComposer onClose={onCloseComposer} onPublished={onPublished} />}
    </>
  )
}

/* ───────────────────────────── Filtre ───────────────────────────── */

function FilterChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: boolean; children: ReactNode }) {
  /* Chip de 31 px au repos : « tap-44 » porte la zone tactile à 44 px sans la grossir. */
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`tap-44 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
        active
          ? 'bg-[#D4A574]/15 text-[#E8C9A0] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.4)]'
          : 'bg-white/[0.04] text-[#9B9287] hover:bg-white/[0.07] hover:text-[#F0EAE0]'
      }`}
    >
      {icon && <Star size={13} fill={active ? 'currentColor' : 'none'} aria-hidden="true" />}
      {children}
    </button>
  )
}

/* ───────────────────────────── Carte ───────────────────────────── */

function AuthorChip({ name, mine }: { name: string; mine: boolean }) {
  return (
    <span
      className={`inline-flex min-w-0 max-w-[50%] items-center truncate rounded-full px-2.5 py-1 text-[11px] font-medium ${
        mine
          ? 'bg-[#D4A574]/12 text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.25)]'
          : 'bg-[#C2788E]/12 text-[#C2788E] shadow-[inset_0_0_0_1px_rgba(194,120,142,0.3)]'
      }`}
    >
      {name}
    </span>
  )
}

/**
 * Suit l'état d'un média : « loading » tant que l'URL signée n'est pas là ou que
 * l'élément <img>/<video> n'a pas fini de charger, « ready » une fois affiché,
 * « error » si la signature a échoué ou si le média déclenche onerror.
 */
function useMediaState(url: string | undefined, signFailed: boolean) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(signFailed ? 'error' : 'loading')
  // Réinitialise quand l'URL change (nouvelle signature, réessai…) ou en cas d'échec de signature
  useEffect(() => { setStatus(signFailed ? 'error' : 'loading') }, [url, signFailed])
  return {
    status,
    onReady: () => setStatus('ready'),
    onError: () => setStatus('error'),
    reset: () => setStatus('loading'),
  }
}

function VlogCard({ vlog, tz, url, signFailed, onRetry, isMine, authorName, onOpen }: { vlog: Vlog; tz: string; url?: string; signFailed: boolean; onRetry: () => void; isMine: boolean; authorName: string; onOpen: () => void }) {
  const d = parseISO(vlog.taken_at)
  const civil = zonedCivilDate(tz, d)
  const dateLabel = capitalizeFirst(formatDayMonthFR(civil))
  // Le pied de carte est étroit (quatre colonnes sur grand écran) : le jour de la
  // semaine y faisait tronquer la date. Il reste dans l'intitulé du bouton et dans
  // la lightbox ; ici on garde « 28 août · 14:49 », qui tient à toutes les largeurs.
  const shortDateLabel = formatDayMonthShortFR(civil)
  const timeLabel = formatTimeIn(tz, d)
  const media = useMediaState(url, signFailed)
  const isError = media.status === 'error'
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
          {url && !isError && (
            vlog.media_type === 'video' ? (
              <video src={url} preload="metadata" playsInline muted className="h-full w-full object-cover" tabIndex={-1} onLoadedData={media.onReady} onError={media.onError} />
            ) : (
              <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100" onLoad={media.onReady} onError={media.onError} />
            )
          )}
          {/* Badge lecture (vidéo prête) */}
          {vlog.media_type === 'video' && media.status === 'ready' && (
            <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
              <span className="grid size-12 place-items-center rounded-full bg-[#110F0E]/60 text-[#F0EAE0] backdrop-blur-sm shadow-[inset_0_0_0_1px_rgba(240,234,224,0.15)]">
                <Play size={18} className="translate-x-px" fill="currentColor" />
              </span>
            </span>
          )}
          {/* État de chargement */}
          {!isError && media.status !== 'ready' && (
            <div className="absolute inset-0 grid place-items-center bg-white/[0.04] animate-pulse" aria-hidden="true">
              <Loader2 size={20} className="animate-spin text-[#9B9287] motion-reduce:animate-none" />
            </div>
          )}
          {/* Badge « Étape » : moment marqué comme important */}
          {vlog.is_milestone && (
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[#110F0E]/70 px-2.5 py-1 text-[11px] font-medium text-[#E8C9A0] backdrop-blur-sm shadow-[inset_0_0_0_1px_rgba(212,165,116,0.4)]">
              <Star size={11} fill="currentColor" aria-hidden="true" /> Étape
            </span>
          )}
        </div>
        <div className="p-4 space-y-3">
          {vlog.caption ? (
            <p className="text-[14px] text-[#F0EAE0] leading-snug line-clamp-2">{vlog.caption}</p>
          ) : (
            <p className="text-[14px] text-[#9B9287] font-display-italic leading-snug">Sans légende</p>
          )}
          {/* Le nom peut rétrécir (il est tronqué proprement), la date jamais : elle
              garde sa largeur et passe à la ligne quand la carte est trop étroite. */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <AuthorChip name={authorName} mine={isMine} />
            <p className="shrink-0 whitespace-nowrap text-xs text-[#9B9287]">
              {shortDateLabel} · <span className="num">{timeLabel}</span>
            </p>
          </div>
        </div>
      </button>
      {/* État d'erreur : superposition SŒUR du bouton (pas de bouton imbriqué) */}
      {isError && (
        <div className="absolute left-0 right-0 top-0 aspect-[3/4] grid place-items-center bg-[#161311] px-3 text-center pointer-events-none" role="alert">
          <div className="flex flex-col items-center gap-2">
            <span className="grid size-9 place-items-center rounded-full bg-white/[0.05] text-[#9B9287]" aria-hidden="true">
              <ImageOff size={16} />
            </span>
            <p className="text-[12px] text-[#9B9287] leading-snug">Média indisponible</p>
            <button
              type="button"
              onClick={onRetry}
              className="tap-44 pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] font-medium text-[#F0EAE0] hover:bg-white/[0.14] transition-colors"
            >
              <RotateCw size={13} aria-hidden="true" /> Réessayer
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

/* ───────────────────────────── Lightbox ───────────────────────────── */

function Lightbox({ vlog, tz, url, signFailed, onRetry, isMine, authorName, deleting, onDelete, marking, onToggleMilestone, onClose }: { vlog: Vlog; tz: string; url?: string; signFailed: boolean; onRetry: () => void; isMine: boolean; authorName: string; deleting: boolean; onDelete: () => void; marking: boolean; onToggleMilestone: () => void; onClose: () => void }) {
  const d = parseISO(vlog.taken_at)
  const dateLabel = capitalizeFirst(formatLongDateFR(zonedCivilDate(tz, d)))
  const media = useMediaState(url, signFailed)
  const isError = media.status === 'error'
  return (
    <Modal title={`Vlog de ${authorName}`} description={`${dateLabel} · ${formatTimeIn(tz, d)}`} onClose={onClose}>
      <div className="-mx-1 overflow-hidden rounded-[14px] bg-black/40 shadow-[inset_0_0_0_1px_rgba(240,234,224,0.07)]">
        {isError ? (
          <div className="aspect-[3/4] w-full grid place-items-center px-4 text-center" role="alert">
            <div className="flex flex-col items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-white/[0.05] text-[#9B9287]" aria-hidden="true">
                <ImageOff size={20} />
              </span>
              <p className="text-sm text-[#9B9287]">Média indisponible</p>
              <button
                type="button"
                onClick={onRetry}
                className="tap-44 inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 py-2 text-[13px] font-medium text-[#F0EAE0] hover:bg-white/[0.14] transition-colors"
              >
                <RotateCw size={14} aria-hidden="true" /> Réessayer
              </button>
            </div>
          </div>
        ) : (
          <div className={media.status === 'ready' ? 'relative' : 'relative min-h-[45dvh]'}>
            {url && (
              vlog.media_type === 'video' ? (
                <video src={url} controls playsInline preload="metadata" autoPlay className="w-full max-h-[60dvh] object-contain" onLoadedData={media.onReady} onError={media.onError} />
              ) : (
                <img src={url} alt={vlog.caption ?? `Vlog de ${authorName}`} className="w-full max-h-[60dvh] object-contain" onLoad={media.onReady} onError={media.onError} />
              )
            )}
            {media.status !== 'ready' && (
              <div className="absolute inset-0 grid place-items-center bg-white/[0.03]" aria-hidden="true">
                <Loader2 size={26} className="animate-spin text-[#9B9287] motion-reduce:animate-none" />
              </div>
            )}
          </div>
        )}
      </div>
      {vlog.caption && <p className="text-sm text-[#F0EAE0] leading-relaxed whitespace-pre-wrap">{vlog.caption}</p>}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
        <div className="flex items-center gap-2 min-w-0">
          <AuthorChip name={authorName} mine={isMine} />
          {vlog.is_milestone && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#D4A574]/12 px-2.5 py-1 text-[11px] font-medium text-[#E8C9A0] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.4)]">
              <Star size={11} fill="currentColor" aria-hidden="true" /> Étape
            </span>
          )}
        </div>
        {isMine && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Marquer une étape après coup : sans ça, un oubli à la publication
                obligeait à supprimer le vlog puis à le republier. */}
            <button
              type="button"
              onClick={onToggleMilestone}
              disabled={marking || deleting}
              className={`btn-tertiary disabled:opacity-60 ${vlog.is_milestone ? '!text-[#E8C9A0]' : ''}`}
            >
              <Star size={13} fill={vlog.is_milestone ? 'currentColor' : 'none'} aria-hidden="true" />
              {marking ? 'Enregistrement…' : vlog.is_milestone ? 'Retirer l’étape' : 'Marquer une étape'}
            </button>
            <button type="button" onClick={onDelete} disabled={deleting || marking} className="btn-tertiary !text-[#F0A5AD] disabled:opacity-60">
              <Trash2 size={13} aria-hidden="true" /> {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
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

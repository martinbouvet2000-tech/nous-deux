import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, Heart, MapPin, Navigation, User, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/db'
import { useAuthStore } from '@/stores/authStore'
import { useLiveData } from '@/hooks/useLiveData'
import type { LocationPoint } from '@/types/database'
import { haversine, formatDistance, totalDistance } from '@/lib/geo'
import { shine, unshine } from '@/lib/shine'
import { BTN_GHOST, CARD, CARD_EDGE, CARD_TITLE, EYEBROW } from '@/lib/ui'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import ShareLocationToggle from '@/components/map/ShareLocationToggle'

/* ─────────────────────────── Constantes ─────────────────────────── */

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const PARIS: L.LatLngTuple = [48.8566, 2.3522]
const GOLD = '#D4A574'
const CREAM = '#F0EAE0'
const TICK_MS = 30_000

/* ── Molette ──
 * Un cran de molette faisait sauter un niveau de zoom entier : sur un
 * ordinateur, la carte passait du quartier au continent en trois crans.
 * `zoomSnap` autorise désormais des quarts de niveau, et il faut bien plus de
 * pixels de défilement pour franchir un niveau complet. Le pincement à deux
 * doigts n'emprunte pas ce chemin (handler `touchZoom`) : il reste tel quel,
 * juste un peu plus fluide puisqu'il n'est plus obligé de s'arrêter sur un
 * niveau entier.
 */
const ZOOM_SNAP = 0.25
const ZOOM_DELTA = 0.5
const WHEEL_PX_PER_ZOOM_LEVEL = 300
const WHEEL_DEBOUNCE_MS = 60
/** Durée d'affichage du rappel « clique d'abord sur la carte ». */
const WHEEL_HINT_MS = 2400

/** Zoom minimal quand on centre sur quelqu'un, et plafond de la vue initiale. */
const FOCUS_ZOOM = 15
const FIT_MAX_ZOOM = 16

/** Styles Leaflet restylés au thème sombre + marqueurs personnalisés */
const MAP_CSS = `
.awy-map .leaflet-container { background: #110F0E; font-family: inherit; }
.awy-map .leaflet-control-zoom { border: 0; box-shadow: 0 12px 30px -12px rgba(0,0,0,.7); border-radius: 12px; overflow: hidden; margin: 14px; }
.awy-map .leaflet-control-zoom a {
  width: 44px; height: 44px; line-height: 44px; font-size: 18px;
  background: #1E1B17; color: #F0EAE0; border: 1px solid rgba(240,234,224,.08); border-bottom-width: 0;
}
.awy-map .leaflet-control-zoom a:last-child { border-bottom-width: 1px; }
.awy-map .leaflet-control-zoom a:hover { background: #2C2724; color: #F0EAE0; }
.awy-map .leaflet-control-zoom a.leaflet-disabled { color: #9B9287; background: #1E1B17; }
.awy-map .leaflet-control-attribution {
  background: rgba(17,15,14,.8); color: #9B9287; font-size: 11px; padding: 3px 8px; margin: 8px;
  border-radius: 999px; border: 1px solid rgba(240,234,224,.06);
}
.awy-map .leaflet-control-attribution a { color: #9B9287; text-decoration: underline; text-underline-offset: 2px; }
.awy-map .leaflet-bar a:first-child { border-top-left-radius: 12px; border-top-right-radius: 12px; }
.awy-map .leaflet-bar a:last-child { border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }
.awy-marker { background: transparent; border: 0; }
.awy-marker-move { transition: transform 700ms cubic-bezier(0.2, 0, 0, 1); }
.awy-pin {
  position: relative; width: 34px; height: 34px; border-radius: 999px; display: grid; place-items: center;
  font-family: var(--font-display), Georgia, serif; font-size: 16px; line-height: 1;
  box-shadow: 0 8px 24px -8px rgba(0,0,0,.8), 0 0 0 2px rgba(17,15,14,.9);
}
.awy-pin--partner { background: linear-gradient(135deg, #D4A574, #C2788E); color: #110F0E; }
.awy-pin--me { background: #F0EAE0; color: #110F0E; box-shadow: 0 8px 24px -8px rgba(0,0,0,.8), 0 0 0 2px rgba(17,15,14,.9), 0 0 0 3px rgba(212,165,116,.55); }
.awy-pin--partner::before {
  content: ''; position: absolute; inset: -6px; border-radius: 999px;
  background: radial-gradient(circle, rgba(212,165,116,.45), rgba(194,120,142,.15) 60%, transparent 70%);
  animation: awy-pulse 2.4s ease-out infinite; z-index: -1;
}
@keyframes awy-pulse {
  0% { transform: scale(.7); opacity: .9; }
  70% { transform: scale(1.9); opacity: 0; }
  100% { transform: scale(1.9); opacity: 0; }
}
.awy-wheel-hint { animation: awy-hint-in 200ms ease-out both; }
@keyframes awy-hint-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .awy-pin--partner::before { animation: none; transform: scale(1.1); opacity: .35; }
  .awy-marker-move { transition: none; }
  .awy-wheel-hint { animation: none; }
}
`

/* ─────────────────────────── Helpers ─────────────────────────── */

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function timeAgo(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime())
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  return `il y a ${d} j`
}

function initialOf(name: string | undefined): string {
  const c = (name ?? '').trim().charAt(0)
  return c ? c.toUpperCase() : '?'
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

function makeIcon(kind: 'partner' | 'me', initial: string): L.DivIcon {
  return L.divIcon({
    className: 'awy-marker',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="awy-pin awy-pin--${kind}" aria-hidden="true">${escapeHtml(initial)}</div>`,
  })
}

function isToday(iso: string, dayStart: number): boolean {
  return new Date(iso).getTime() >= dayStart
}

/**
 * Cercle de précision : le halo translucide autour d'un marqueur a exactement
 * le rayon annoncé par le GPS (colonne `locations.accuracy`). C'est la façon
 * honnête d'afficher une position — « quelque part dans ce cercle » plutôt
 * qu'une punaise au mètre près qui laisserait croire à une exactitude qu'on n'a
 * pas. Sans précision enregistrée, pas de cercle : on n'invente pas de rayon.
 */
function syncAccuracyCircle(
  map: L.Map,
  ref: RefObject<L.Circle | null>,
  point: LocationPoint | null,
  color: string,
): void {
  const radius = point?.accuracy
  if (!point || radius == null || !Number.isFinite(radius) || radius <= 0) {
    ref.current?.remove()
    ref.current = null
    return
  }
  const ll: L.LatLngTuple = [point.lat, point.lng]
  if (!ref.current) {
    ref.current = L.circle(ll, {
      radius,
      // Décoratif : il ne doit jamais voler un clic au marqueur ni à la carte.
      interactive: false,
      color,
      weight: 1,
      opacity: 0.3,
      fillColor: color,
      fillOpacity: 0.07,
    }).addTo(map)
    return
  }
  ref.current.setLatLng(ll)
  ref.current.setRadius(radius)
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function MapPage() {
  const { profile, partnerProfile } = useAuthStore()
  const myId = profile?.id ?? null
  const partnerId = partnerProfile?.id ?? null
  const partnerName = partnerProfile?.display_name ?? 'ton/ta partenaire'

  const [points, setPoints] = useState<LocationPoint[]>([])
  const [lastMe, setLastMe] = useState<LocationPoint | null>(null)
  const [lastPartner, setLastPartner] = useState<LocationPoint | null>(null)
  const partnerShares = !!partnerProfile?.share_location || !!lastPartner
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const partnerMarkerRef = useRef<L.Marker | null>(null)
  const meMarkerRef = useRef<L.Marker | null>(null)
  const polylineRef = useRef<L.Polyline | null>(null)
  const startDotRef = useRef<L.CircleMarker | null>(null)
  const partnerHaloRef = useRef<L.Circle | null>(null)
  const meHaloRef = useRef<L.Circle | null>(null)
  const viewSetRef = useRef(false)
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Rappel discret quand on tourne la molette sans avoir pris la carte en main.
  const [wheelHint, setWheelHint] = useState(false)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Données ── */
  const fetchAll = useCallback(async () => {
    if (!myId || !partnerId) return
    const since = startOfToday().toISOString()
    const [today, me, partner] = await Promise.all([
      run(
        supabase.from('locations').select('*').in('user_id', [myId, partnerId]).gte('recorded_at', since).order('recorded_at', { ascending: false }).limit(2000),
        { errorMessage: 'Impossible de charger la carte.' },
      ),
      run(supabase.from('locations').select('*').eq('user_id', myId).order('recorded_at', { ascending: false }).limit(1).maybeSingle(), { silent: true }),
      run(supabase.from('locations').select('*').eq('user_id', partnerId).order('recorded_at', { ascending: false }).limit(1).maybeSingle(), { silent: true }),
    ])
    if (today.data) setPoints([...(today.data as LocationPoint[])].reverse())
    setLastMe((me.data as LocationPoint | null) ?? null)
    setLastPartner((partner.data as LocationPoint | null) ?? null)
    setLoaded(true)
  }, [myId, partnerId])

  // Chargement, temps réel et rattrapage au retour du réseau. Les nouveaux points
  // arrivent un par un (INSERT) et sont insérés sans tout relire ; le rattrapage,
  // lui, relit la journée — les INSERT manqués pendant une coupure / veille
  // laisseraient sinon la carte figée sur une position morte.
  useLiveData({
    enabled: !!myId && !!partnerId,
    channel: myId ? `locations:${myId}` : null,
    load: fetchAll,
    bind: (ch) => {
      const addPoint = (p: LocationPoint) => {
        setPoints((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))))
        if (p.user_id === partnerId) setLastPartner((prev) => (!prev || prev.recorded_at <= p.recorded_at ? p : prev))
        else setLastMe((prev) => (!prev || prev.recorded_at <= p.recorded_at ? p : prev))
      }
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'locations', filter: `user_id=eq.${partnerId}` }, (payload) => addPoint(payload.new as LocationPoint))
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'locations', filter: `user_id=eq.${myId}` }, (payload) => addPoint(payload.new as LocationPoint))
    },
  })

  // « il y a x min » rafraîchi toutes les 30 s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(t)
  }, [])

  /* ── Dérivés ── */
  const dayStart = startOfToday().getTime()
  const partnerToday = useMemo(() => points.filter((p) => p.user_id === partnerId && isToday(p.recorded_at, dayStart)), [points, partnerId, dayStart])
  const myToday = useMemo(() => points.filter((p) => p.user_id === myId && isToday(p.recorded_at, dayStart)), [points, myId, dayStart])
  const partnerDistance = useMemo(() => totalDistance(partnerToday), [partnerToday])
  const myDistance = useMemo(() => totalDistance(myToday), [myToday])
  const between = lastMe && lastPartner ? haversine(lastMe, lastPartner) : null

  /* ── Carte Leaflet ── */
  const hasPartner = !!partnerId
  useEffect(() => {
    const el = containerRef.current
    if (!hasPartner || !el || mapRef.current) return

    const map = L.map(el, {
      preferCanvas: true,
      attributionControl: false,
      zoomControl: true,
      center: PARIS,
      zoom: 5,
      zoomSnap: ZOOM_SNAP,
      zoomDelta: ZOOM_DELTA,
      wheelPxPerZoomLevel: WHEEL_PX_PER_ZOOM_LEVEL,
      wheelDebounceTime: WHEEL_DEBOUNCE_MS,
      // La molette n'est armée qu'une fois la carte prise en main (voir plus bas).
      scrollWheelZoom: false,
    })
    // CARTO ne sert plus de tuile au-delà de 19 : on autorise quand même un
    // cran de plus en étirant la dernière, de quoi lire un cercle de précision
    // de quelques mètres sans réclamer une tuile qui n'existe pas.
    L.tileLayer(TILE_URL, { maxZoom: 20, maxNativeZoom: 19, subdomains: 'abcd' }).addTo(map)
    L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution(TILE_ATTRIBUTION).addTo(map)
    mapRef.current = map

    // La carte occupe les deux tiers de la hauteur d'écran. Si la molette
    // zoomait en permanence, faire défiler la page en passant au-dessus
    // deviendrait un piège : la page se fige et la carte part en vrille. On
    // n'arme donc le zoom molette qu'après un clic, un toucher ou une
    // tabulation sur la carte, et on le désarme dès qu'on la quitte. Le
    // pincement à deux doigts, lui, n'est jamais désarmé.
    const armWheel = () => {
      map.scrollWheelZoom.enable()
      setWheelHint(false)
    }
    const disarmWheel = () => map.scrollWheelZoom.disable()
    const onWheel = () => {
      if (map.scrollWheelZoom.enabled()) return
      setWheelHint(true)
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
      hintTimerRef.current = setTimeout(() => setWheelHint(false), WHEEL_HINT_MS)
    }
    map.on('click focus', armWheel)
    map.on('blur', disarmWheel)
    el.addEventListener('pointerleave', disarmWheel)
    el.addEventListener('wheel', onWheel, { passive: true })

    const t = setTimeout(() => map.invalidateSize(), 50)
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    ro?.observe(el)

    return () => {
      clearTimeout(t)
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
      window.removeEventListener('resize', onResize)
      el.removeEventListener('pointerleave', disarmWheel)
      el.removeEventListener('wheel', onWheel)
      ro?.disconnect()
      map.remove()
      mapRef.current = null
      partnerMarkerRef.current = null
      meMarkerRef.current = null
      polylineRef.current = null
      startDotRef.current = null
      partnerHaloRef.current = null
      meHaloRef.current = null
      viewSetRef.current = false
    }
  }, [hasPartner])

  // Marqueurs + tracé
  const partnerInitial = initialOf(partnerProfile?.display_name)
  const myInitial = initialOf(profile?.display_name)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Partenaire
    if (lastPartner) {
      const ll: L.LatLngTuple = [lastPartner.lat, lastPartner.lng]
      if (!partnerMarkerRef.current) {
        partnerMarkerRef.current = L.marker(ll, { icon: makeIcon('partner', partnerInitial), keyboard: false, zIndexOffset: 100 }).addTo(map)
      } else {
        const m = partnerMarkerRef.current
        const icon = m.getElement()
        icon?.classList.add('awy-marker-move')
        m.setLatLng(ll)
        if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
        moveTimerRef.current = setTimeout(() => icon?.classList.remove('awy-marker-move'), 750)
      }
    } else if (partnerMarkerRef.current) {
      partnerMarkerRef.current.remove()
      partnerMarkerRef.current = null
    }

    // Moi
    if (lastMe) {
      const ll: L.LatLngTuple = [lastMe.lat, lastMe.lng]
      if (!meMarkerRef.current) meMarkerRef.current = L.marker(ll, { icon: makeIcon('me', myInitial), keyboard: false }).addTo(map)
      else meMarkerRef.current.setLatLng(ll)
    } else if (meMarkerRef.current) {
      meMarkerRef.current.remove()
      meMarkerRef.current = null
    }

    // Halos de précision, sous les deux marqueurs
    syncAccuracyCircle(map, partnerHaloRef, lastPartner, GOLD)
    syncAccuracyCircle(map, meHaloRef, lastMe, CREAM)

    // Tracé du jour du partenaire
    const path: L.LatLngTuple[] = partnerToday.map((p) => [p.lat, p.lng])
    if (path.length >= 1) {
      if (!polylineRef.current) {
        polylineRef.current = L.polyline(path, { color: GOLD, weight: 3, opacity: 0.75, lineJoin: 'round', lineCap: 'round' }).addTo(map)
      } else {
        polylineRef.current.setLatLngs(path)
      }
      if (!startDotRef.current) {
        startDotRef.current = L.circleMarker(path[0], { radius: 4, color: GOLD, weight: 2, fillColor: '#110F0E', fillOpacity: 1 }).addTo(map)
      } else {
        startDotRef.current.setLatLng(path[0])
      }
    } else {
      polylineRef.current?.remove(); polylineRef.current = null
      startDotRef.current?.remove(); startDotRef.current = null
    }

    // Vue initiale (une seule fois, quand les données sont arrivées)
    if (!viewSetRef.current && loaded) {
      viewSetRef.current = true
      if (lastPartner && lastMe) {
        // Deux positions dans la même ville : l'ancien plafond de 14 bridait la
        // vue alors qu'on avait toute la place de s'approcher. 16 laisse voir la
        // rue, et `zoomSnap` au quart de niveau ajuste le cadrage au plus juste.
        map.fitBounds(L.latLngBounds([lastPartner.lat, lastPartner.lng], [lastMe.lat, lastMe.lng]).pad(0.25), { maxZoom: FIT_MAX_ZOOM })
      } else if (lastPartner) {
        map.setView([lastPartner.lat, lastPartner.lng], FOCUS_ZOOM)
      } else if (lastMe) {
        map.setView([lastMe.lat, lastMe.lng], FOCUS_ZOOM)
      } else if (partnerProfile?.location_lat != null && partnerProfile?.location_lng != null) {
        map.setView([partnerProfile.location_lat, partnerProfile.location_lng], 11)
      } else {
        map.setView(PARIS, 5)
      }
    }
  }, [lastPartner, lastMe, partnerToday, loaded, partnerInitial, myInitial, partnerProfile?.location_lat, partnerProfile?.location_lng])

  const centerOnPartner = () => {
    const map = mapRef.current
    if (!map || !lastPartner) return
    // Vol animé seulement si personne n'a demandé moins de mouvement.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      map.setView([lastPartner.lat, lastPartner.lng], Math.max(map.getZoom(), FOCUS_ZOOM), { animate: false })
      return
    }
    map.flyTo([lastPartner.lat, lastPartner.lng], Math.max(map.getZoom(), FOCUS_ZOOM), { duration: 0.8 })
  }

  /* ── Rendu ── */
  if (!partnerProfile) {
    return (
      <div className="px-5 md:px-8 py-6 max-md:py-7 max-w-3xl lg:max-w-[1080px] mx-auto space-y-5 max-md:space-y-6 reveal">
        <PageHeader eyebrow="Où es-tu ?" title="Carte" accent="à deux" subtitle="Vos deux positions, sur une même carte." />
        <EmptyState icon={MapPin} title="Personne à retrouver pour l’instant" text="Lie ton/ta partenaire dans les Réglages pour voir vos positions sur la carte." />
      </div>
    )
  }

  return (
    <div className="px-5 md:px-8 py-6 max-md:py-7 max-w-3xl lg:max-w-[1080px] mx-auto space-y-5 max-md:space-y-6 reveal">
      <style>{MAP_CSS}</style>
      <PageHeader
        eyebrow="Où es-tu ?"
        title="Carte"
        accent="à deux"
        subtitle={`La position de ${partnerName} et la tienne, en temps réel, sur une même carte.`}
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 lg:items-start space-y-5 max-md:space-y-6 lg:space-y-0">
        {/* ─── Carte ─── */}
        <div className="space-y-3">
          <div className="lux-card relative rounded-[20px] overflow-hidden awy-map">
            <div
              ref={containerRef}
              role="region"
              aria-label="Carte"
              className="h-[62dvh] md:h-[70dvh] w-full"
            />

            {!partnerShares && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] max-w-[calc(100%-1.5rem)] px-4 py-2 rounded-full bg-[#110F0E]/85 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(240,234,224,0.08)] text-[13px] text-[#9B9287] text-center" role="status">
                {partnerName} ne partage pas sa position pour l’instant
              </div>
            )}

            {wheelHint && (
              <div
                className="awy-wheel-hint absolute bottom-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-none max-w-[calc(100%-6rem)] px-4 py-2 rounded-full bg-[#110F0E]/85 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(240,234,224,0.08)] text-[13px] text-[#9B9287] text-center"
                role="status"
              >
                Clique sur la carte pour zoomer à la molette
              </div>
            )}

            {lastPartner && (
              <button
                type="button"
                onClick={centerOnPartner}
                aria-label={`Centrer sur ${partnerName}`}
                className="absolute bottom-4 left-4 z-[500] inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#1E1B17] text-[#D4A574] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.7),inset_0_0_0_1px_rgba(240,234,224,0.08)] hover:bg-[#2C2724] hover:text-[#F0EAE0] transition-all duration-200 ease-out"
              >
                <Crosshair size={18} aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="text-xs text-[#9B9287] leading-relaxed px-1">
            La position n’est partagée que si chacun l’active. Parcours effacé après 48 h.
          </p>
        </div>

        {/* ─── Colonne latérale ─── */}
        <aside className="space-y-5 max-md:space-y-6" aria-label="Détails des positions">
          {/* Partenaire */}
          <section className={CARD} onMouseMove={shine} onMouseLeave={unshine} aria-labelledby="map-partner-title">
            <div className={CARD_EDGE} aria-hidden="true" />
            <div className="flex items-center gap-3">
              <span className="size-10 shrink-0 rounded-full grid place-items-center font-display text-[17px] text-[#110F0E] bg-gradient-to-br from-[#D4A574] to-[#C2788E]" aria-hidden="true">
                {partnerInitial}
              </span>
              <div className="min-w-0">
                <h2 id="map-partner-title" className={CARD_TITLE}>{partnerName}</h2>
                <p className="text-xs text-[#9B9287] flex items-center gap-1.5 mt-0.5">
                  <Clock size={11} aria-hidden="true" />
                  {!partnerShares
                    ? 'Ne partage pas sa position'
                    : lastPartner
                      ? `Mis à jour ${timeAgo(lastPartner.recorded_at, now)}`
                      : 'Aucune position pour l’instant'}
                </p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <dt className={EYEBROW}>Précision</dt>
                <dd className="num font-display text-[20px] text-[#F0EAE0] mt-1">
                  {lastPartner?.accuracy != null ? `±${formatDistance(lastPartner.accuracy)}` : '—'}
                </dd>
              </div>
              <div>
                <dt className={EYEBROW}>Aujourd’hui</dt>
                <dd className="num font-display text-[20px] text-[#F0EAE0] mt-1">{partnerToday.length >= 2 ? formatDistance(partnerDistance) : '—'}</dd>
              </div>
              <div>
                <dt className={EYEBROW}>Points</dt>
                <dd className="num font-display text-[20px] text-[#F0EAE0] mt-1">{partnerToday.length}</dd>
              </div>
            </dl>

            <button type="button" onClick={centerOnPartner} disabled={!lastPartner} className={`${BTN_GHOST} w-full mt-4`} aria-label={`Centrer la carte sur ${partnerName}`}>
              <Navigation size={14} aria-hidden="true" /> Centrer
            </button>
          </section>

          {/* Moi */}
          <section className={CARD} onMouseMove={shine} onMouseLeave={unshine} aria-labelledby="map-me-title">
            <div className={CARD_EDGE} aria-hidden="true" />
            <h2 id="map-me-title" className={CARD_TITLE}>
              <User size={16} className="text-[#D4A574]" aria-hidden="true" /> Moi
            </h2>
            <div className="mt-4">
              <ShareLocationToggle compact />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <dt className={EYEBROW}>Précision</dt>
                <dd className="num font-display text-[20px] text-[#F0EAE0] mt-1">
                  {lastMe?.accuracy != null ? `±${formatDistance(lastMe.accuracy)}` : '—'}
                </dd>
              </div>
              <div>
                <dt className={EYEBROW}>Aujourd’hui</dt>
                <dd className="num font-display text-[20px] text-[#F0EAE0] mt-1">{myToday.length >= 2 ? formatDistance(myDistance) : '—'}</dd>
              </div>
              <div>
                <dt className={EYEBROW}>Dernier point</dt>
                <dd className="text-sm text-[#F0EAE0] mt-1.5">{lastMe ? timeAgo(lastMe.recorded_at, now) : '—'}</dd>
              </div>
            </dl>
          </section>

          {/* Entre vous */}
          <section className={CARD} onMouseMove={shine} onMouseLeave={unshine} aria-labelledby="map-between-title">
            <div className={CARD_EDGE} aria-hidden="true" />
            <h2 id="map-between-title" className={CARD_TITLE}>
              <Heart size={16} className="text-[#C2788E]" aria-hidden="true" /> Entre vous
            </h2>
            <p className="num font-display text-[2.2rem] leading-none text-[#F0EAE0] mt-3">
              {between != null ? formatDistance(between) : '—'}
            </p>
            <p className="text-xs text-[#9B9287] mt-2 leading-relaxed">
              {between != null
                ? 'À vol d’oiseau, entre vos deux dernières positions.'
                : 'Dès que vous partagez tous les deux votre position, la distance apparaît ici.'}
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}

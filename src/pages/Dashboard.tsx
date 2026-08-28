import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useLiveData } from '@/hooks/useLiveData'
import { MapPin, Timer, Send, Lock, Plus, X, Link2, PartyPopper, Hourglass, PhoneCall, Check, Flame } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { differenceInDays, differenceInHours, differenceInMinutes, isPast, parseISO, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Countdown, DailyQuestion } from '@/types/database'
import LoveNoteWidget from '@/components/Dashboard/LoveNoteWidget'
import HamsterMoodWidget from '@/components/Dashboard/HamsterMoodWidget'
import AvailabilityWidget from '@/components/Dashboard/AvailabilityWidget'
import CurrentActivityBanner from '@/components/schedule/CurrentActivityBanner'
import GratitudeWidget from '@/components/Dashboard/GratitudeWidget'
import Modal from '@/components/ui/Modal'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { timezoneDiffLabel, timezoneCity, formatTimeIn, utcOffsetMinutes, zonedCivilDate, zonedInputToDate } from '@/lib/timezone'
import {
  resolveTimezone, dayKey, mutualStreak, countSinceServerDay, countdownTargetIn,
  DAILY_SIGNAL_LIMIT, STREAK_LOOKBACK_DAYS,
} from '@/lib/today'
import {
  capitalizeFirst, describeDateInput, formatDayMonthFR, formatLongDateFR,
} from '@/lib/dates'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL, EYEBROW } from '@/lib/ui'
import Ornament from '@/components/ui/Ornament'
import CountUp from '@/components/ui/CountUp'
import { shine, unshine } from '@/lib/shine'

/* ═══ Helpers ═══ */
/** Salutation calée sur l'heure QU'IL EST CHEZ TOI (fuseau du profil), pas sur celle du navigateur. */
function getGreeting(tz: string): string {
  const h = hourIn(tz)
  if (h < 6) return 'Bonne nuit'
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

const COUNTDOWN_EMOJIS = ['❤️', '✈️', '🏠', '🎉', '🎂', '💍', '🌅', '🎄']

/** Heure locale décimale (0-24) dans un fuseau */
function hourIn(tz: string): number {
  const off = utcOffsetMinutes(tz)
  const d = new Date(Date.now() + off * 60_000)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}
/**
 * Arc solaire : position du soleil dans la journée locale (approx. lever 6h30 / coucher 20h30).
 * La nuit : arc éteint + croissant de lune. Aucune API, juste l'heure sur place.
 */
function SunArc({ tz }: { tz: string }) {
  const h = hourIn(tz)
  const rise = 6.5, set = 20.5
  const isDay = h >= rise && h <= set
  const t = isDay ? (h - rise) / (set - rise) : 0
  // demi-cercle de (4,22) à (40,22), rayon 18
  const ang = Math.PI * (1 - t)
  const sx = 22 + 18 * Math.cos(ang), sy = 22 - 18 * Math.sin(ang)
  return (
    <svg viewBox="0 0 44 24" className="h-7 w-[52px] shrink-0" aria-hidden="true">
      <path d="M4 22 A18 18 0 0 1 40 22" fill="none" stroke="rgba(240,234,224,0.16)" strokeWidth="1.75" />
      {isDay ? (
        <>
          <path d="M4 22 A18 18 0 0 1 40 22" fill="none" stroke="#D4A574" strokeWidth="1.75" strokeLinecap="round" strokeDasharray="56.6" strokeDashoffset={56.6 * (1 - t)} />
          <circle cx={sx} cy={sy} r="3" fill="#F0EAE0" style={{ filter: 'drop-shadow(0 0 5px rgba(212,165,116,0.9))' }} />
        </>
      ) : (
        <path d="M25 6.5a5 5 0 1 1-6.2-6.2 4 4 0 0 0 6.2 6.2z" transform="translate(-1,4)" fill="#9B9CC7" opacity="0.85" />
      )}
    </svg>
  )
}
function isNightIn(tz: string) { const h = hourIn(tz); return h < 6.5 || h > 20.5 }

/* ═══ « Envie d'appel » ═══
 * Un signal temps réel : « j'ai envie de te parler, là ». À l'appui, on écrit dans
 * la table `taps` (moi → partenaire) ; l'autre voit s'allumer une carte tout de suite.
 * Réutilise `taps` (RLS + anti-spam serveur 30/j + Realtime déjà branchés) — un « tap »
 * devient sémantiquement une envie d'appel, sans nouvelle table ni migration.
 */
const CALL_WINDOW_MS = 30 * 60_000 // une envie d'appel reste « fraîche » ~30 min

// À partir de combien d'envois restants on prévient (le plafond serveur est de 30/jour).
const CALL_QUOTA_WARN_AT = 5

// Mémoire locale « j'ai lancé une envie d'appel » : sert à reconnaître, quand le
// partenaire répond, qu'il « arrive » (plutôt qu'il lance un nouvel appel).
function outKey(me: string, partner: string) { return `awy:call:out:${me}:${partner}` }
function readOutgoing(me: string, partner: string): number {
  try { const v = localStorage.getItem(outKey(me, partner)); return v ? Number(v) : 0 } catch { return 0 }
}
function writeOutgoing(me: string, partner: string, ts: number) {
  try { localStorage.setItem(outKey(me, partner), String(ts)) } catch { /* stockage indisponible */ }
}
function clearOutgoing(me: string, partner: string) {
  try { localStorage.removeItem(outKey(me, partner)) } catch { /* stockage indisponible */ }
}

/* ═══ DASHBOARD ═══ */
export default function Dashboard() {
  const { profile, partnerProfile } = useAuthStore()
  // Source de vérité pour « aujourd'hui » : le fuseau du profil (jamais celui du navigateur).
  // Toute la page — salutation, date affichée, série, date minimale du compte à rebours —
  // se cale dessus. Cf. `src/lib/today.ts` pour la règle et sa seule exception (anti-spam).
  const selfTz = resolveTimezone(profile?.timezone)
  const [time1, setTime1] = useState('')
  const [time2, setTime2] = useState('')

  // Envie d'appel (réutilise la table `taps`)
  const [sendingCall, setSendingCall] = useState(false)
  const [sentMsg, setSentMsg] = useState<string | null>(null)
  const [incomingCall, setIncomingCall] = useState<{ id: string; created_at: string } | null>(null)
  const [incomingIsJoining, setIncomingIsJoining] = useState(false)
  const [callsSentToday, setCallsSentToday] = useState(0) // quota serveur (journée UTC, comme la base)
  const [streak, setStreak] = useState(0) // jours consécutifs où on s'est fait signe tous les deux
  const dismissedRef = useRef<Set<string>>(new Set()) // envies d'appel masquées localement (« Plus tard »)

  // Countdown
  const [countdown, setCountdown] = useState<Countdown | null>(null)
  const [remaining, setRemaining] = useState({ days: 0, hours: 0, minutes: 0, passed: false })
  const [showCountdownForm, setShowCountdownForm] = useState(false)
  const [cdTitle, setCdTitle] = useState('')
  const [cdDate, setCdDate] = useState('')
  const [cdEmoji, setCdEmoji] = useState('❤️')
  const [cdSaving, setCdSaving] = useState(false)

  // Mood

  // Question
  const [question, setQuestion] = useState<DailyQuestion | null>(null)
  const [myAnswer, setMyAnswer] = useState('')
  const [savedAnswer, setSavedAnswer] = useState<string | null>(null)
  const [partnerAnswer, setPartnerAnswer] = useState<string | null>(null)
  const [answering, setAnswering] = useState(false)

  // « Jour N ensemble » : on compare deux dates civiles, celle d'aujourd'hui VUE DE
  // TON FUSEAU et celle du début — sinon le compteur avançait d'un jour à minuit
  // navigateur, puis rebasculait. Même notion de « aujourd'hui » que le reste.
  const daysTogether = profile?.relationship_start
    ? differenceInDays(zonedCivilDate(selfTz, new Date()), parseISO(profile.relationship_start))
    : null

  // Clock tick
  useEffect(() => {
    if (!profile) return
    const tick = () => {
      setTime1(formatTimeIn(profile.timezone))
      if (partnerProfile) setTime2(formatTimeIn(partnerProfile.timezone))
    }
    tick()
    const i = setInterval(tick, 1000)
    return () => clearInterval(i)
  }, [profile, partnerProfile])

  const computeRemaining = (target: Date) => {
    if (isPast(target)) return { days: 0, hours: 0, minutes: 0, passed: true }
    const now = new Date()
    return {
      days: differenceInDays(target, now),
      hours: differenceInHours(target, now) % 24,
      minutes: differenceInMinutes(target, now) % 60,
      passed: false,
    }
  }

  // Countdown ticker (minute) — l'échéance se lit dans TON fuseau (cf. `countdownTargetIn`)
  useEffect(() => {
    if (!countdown) return
    const target = countdownTargetIn(selfTz, countdown.target_date)
    setRemaining(computeRemaining(target))
    const i = setInterval(() => setRemaining(computeRemaining(target)), 30_000)
    return () => clearInterval(i)
  }, [countdown, selfTz])

  // Load all data
  const loadAll = useCallback(async () => {
    if (!profile) return

    // Envie d'appel reçue : le tap partenaire → moi le plus récent, encore « frais »
    // (≤ 30 min) et pas encore masqué. Réutilise l'abonnement Realtime sur `taps`.
    if (partnerProfile) {
      const since = new Date(Date.now() - CALL_WINDOW_MS).toISOString()
      const { data: calls } = await supabase
        .from('taps').select('id, created_at')
        .eq('sender_id', partnerProfile.id).eq('receiver_id', profile.id)
        .gte('created_at', since).order('created_at', { ascending: false }).limit(1)
      const latest = (calls?.[0] as { id: string; created_at: string } | undefined) ?? null
      if (latest && !dismissedRef.current.has(latest.id)) {
        // Si j'ai moi-même lancé une envie d'appel récemment, sa réponse = « il/elle arrive ».
        const out = readOutgoing(profile.id, partnerProfile.id)
        const joining = out > 0 && new Date(latest.created_at).getTime() >= out
        setIncomingCall(latest)
        setIncomingIsJoining(joining)
        if (joining) clearOutgoing(profile.id, partnerProfile.id) // appel abouti → on oublie
      } else {
        setIncomingCall(null)
        setIncomingIsJoining(false)
      }
    } else {
      setIncomingCall(null)
      setIncomingIsJoining(false)
    }

    // ── Les compteurs de la journée ──
    // Un seul aller-retour par personne sert deux usages, avec deux découpes de
    // journée ASSUMÉES et documentées (cf. `src/lib/today.ts`) :
    //  • le quota anti-spam se compte comme la base (journée UTC, `date_trunc('day', now())`) ;
    //  • la série se compte en journées civiles de MON fuseau (`selfTz`).
    const historySince = new Date(Date.now() - (STREAK_LOOKBACK_DAYS + 1) * 86_400_000).toISOString()
    const { data: mySignals } = await supabase
      .from('taps').select('created_at')
      .eq('sender_id', profile.id).gte('created_at', historySince)
      .order('created_at', { ascending: false }).limit(2000)
    const mine = ((mySignals ?? []) as { created_at: string }[]).map((t) => t.created_at)
    setCallsSentToday(countSinceServerDay(mine))

    if (partnerProfile) {
      const { data: theirSignals } = await supabase
        .from('taps').select('created_at')
        .eq('sender_id', partnerProfile.id).eq('receiver_id', profile.id).gte('created_at', historySince)
        .order('created_at', { ascending: false }).limit(2000)
      const theirs = ((theirSignals ?? []) as { created_at: string }[]).map((t) => t.created_at)
      setStreak(mutualStreak(selfTz, mine, theirs))
    } else {
      setStreak(0)
    }

    // Countdown (prochain à venir en priorité, sinon le dernier passé)
    const { data: cd } = await supabase.from('countdowns').select('*')
      .eq('is_active', true).order('target_date', { ascending: true })
    if (cd && cd.length > 0) {
      const upcoming = cd.find(c => !isPast(countdownTargetIn(selfTz, c.target_date)))
      setCountdown(upcoming ?? cd[cd.length - 1])
    } else {
      setCountdown(null)
    }

    // Question du jour — tirée côté serveur, par couple, sans répétition
    const { data: q } = await run(supabase.rpc('get_daily_question'), { silent: true })
    const dq = (q ?? null) as DailyQuestion | null
    if (dq && dq.id) {
      setQuestion(dq)
      // Grâce aux RLS, la réponse du/de la partenaire n'est renvoyée QUE si j'ai répondu
      const { data: ans } = await supabase.from('question_answers').select('*').eq('question_id', dq.id)
      const mine = ans?.find(a => a.user_id === profile.id)
      const theirs = ans?.find(a => a.user_id === partnerProfile?.id)
      setSavedAnswer(mine?.answer ?? null)
      setPartnerAnswer(mine && theirs ? theirs.answer : null)
    } else {
      setQuestion(null)
    }
  }, [profile, partnerProfile, selfTz])

  // Chargement, temps réel et rattrapage à la reconnexion (les événements Realtime
  // manqués pendant une coupure / veille ne réapparaissent pas seuls), comme les
  // autres surfaces live.
  useLiveData({
    enabled: !!profile,
    channel: profile ? `dash:${profile.id}` : null,
    load: loadAll,
    bind: (ch) => {
      // Envie d'appel entrante (partenaire → moi) : la carte s'allume tout de suite.
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taps', filter: `receiver_id=eq.${profile?.id}` }, () => loadAll())
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'countdowns' }, () => loadAll())
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'question_answers' }, () => loadAll())
    },
  })

  // Ce qu'il me reste avant le plafond serveur. Le décompte suit la découpe de la
  // BASE (journée UTC) : c'est elle qui refuse l'insertion, pas nous — annoncer un
  // reste calculé sur mon fuseau mentirait entre minuit local et minuit UTC.
  const callsLeftToday = Math.max(0, DAILY_SIGNAL_LIMIT - callsSentToday)

  // « J'ai envie de te parler » → tap moi → partenaire. L'anti-spam serveur (30/j)
  // renvoie une erreur métier proprement affichée par run() ; on s'arrête avant.
  const sendCall = async () => {
    if (!profile || !partnerProfile || sendingCall) return
    if (callsLeftToday === 0) {
      toast.info(`Tu as épuisé tes ${DAILY_SIGNAL_LIMIT} envies d'appel du jour — garde-en pour demain`)
      return
    }
    setSendingCall(true)
    try { navigator.vibrate?.(12) } catch { /* non supporté */ }
    const { ok } = await run(
      supabase.from('taps').insert({ sender_id: profile.id, receiver_id: partnerProfile.id }),
      { errorMessage: "Impossible d'envoyer ton envie d'appel." },
    )
    setSendingCall(false)
    if (ok) {
      setCallsSentToday((n) => n + 1)
      writeOutgoing(profile.id, partnerProfile.id, Date.now())
      setSentMsg(`Envoyé — ${partnerProfile.display_name} va voir que tu veux lui parler`)
      setTimeout(() => setSentMsg(null), 6000)
    }
  }

  // « Je te rejoins » : accuse réception d'une envie d'appel (tap moi → partenaire).
  // Chez le partenaire, qui avait lancé l'appel, ma réponse s'affichera « {prénom} arrive ! ».
  const joinCall = async () => {
    if (!profile || !partnerProfile || !incomingCall || sendingCall) return
    const id = incomingCall.id
    setSendingCall(true)
    try { navigator.vibrate?.(12) } catch { /* non supporté */ }
    const { ok } = await run(
      supabase.from('taps').insert({ sender_id: profile.id, receiver_id: partnerProfile.id }),
      { errorMessage: `Impossible de prévenir ${partnerProfile.display_name}.` },
    )
    setSendingCall(false)
    if (ok) {
      setCallsSentToday((n) => n + 1)
      dismissedRef.current.add(id)
      setIncomingCall(null); setIncomingIsJoining(false)
      setSentMsg(`${partnerProfile.display_name} sait que tu arrives`)
      setTimeout(() => setSentMsg(null), 6000)
    }
  }

  // « Plus tard » : masque la carte localement (aucune écriture serveur).
  const dismissCall = () => {
    if (incomingCall) dismissedRef.current.add(incomingCall.id)
    setIncomingCall(null); setIncomingIsJoining(false)
  }

  const submitAnswer = async () => {
    if (!profile || !question || !myAnswer.trim() || answering) return
    setAnswering(true)
    const { ok } = await run(
      supabase.from('question_answers').insert({ question_id: question.id, user_id: profile.id, answer: myAnswer.trim() }),
      { errorMessage: "Ta réponse n'a pas pu être enregistrée." },
    )
    if (ok) { setSavedAnswer(myAnswer.trim()); setMyAnswer(''); loadAll() }
    setAnswering(false)
  }

  const saveCountdown = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile || !cdTitle.trim() || !cdDate) return
    setCdSaving(true)
    // Date choisie = fin de journée DANS TON FUSEAU, pour que « J-0 » tienne toute
    // la journée sur place (et pas jusqu'à 1 h ou 2 h du matin de la veille).
    const target = zonedInputToDate(selfTz, `${cdDate}T23:59`)
    const { ok } = await run(
      supabase.from('countdowns').insert({ created_by: profile.id, title: cdTitle.trim(), target_date: target.toISOString(), emoji: cdEmoji, is_active: true }),
      { errorMessage: 'Impossible de créer le compte à rebours.' },
    )
    setCdSaving(false)
    if (ok) {
      toast.success('Compte à rebours lancé.')
      setShowCountdownForm(false); setCdTitle(''); setCdDate(''); setCdEmoji('❤️')
      loadAll()
    }
  }

  const removeCountdown = async () => {
    if (!countdown) return
    const yes = await confirm({ title: 'Retirer ce compte à rebours ?', message: `« ${countdown.title} » disparaîtra pour vous deux.`, confirmLabel: 'Retirer', danger: true })
    if (!yes) return
    const { ok } = await run(supabase.from('countdowns').update({ is_active: false }).eq('id', countdown.id))
    if (ok) loadAll()
  }

  if (!profile) return null
  const timeDiff = partnerProfile ? timezoneDiffLabel(profile.timezone, partnerProfile.timezone) : null
  // La date affichée est celle qu'il est CHEZ TOI : entre minuit et 2 h du matin,
  // le jour du navigateur et le jour UTC ne sont déjà plus les mêmes.
  const todayKey = dayKey(selfTz)
  const todayLabel = formatDayMonthFR(zonedCivilDate(selfTz, new Date()))

  // Échéance des retrouvailles, lue dans TON fuseau : elle sert à la fois à la barre
  // de progression et à la date affichée dessous (même instant, même jour civil).
  const cdTarget = countdown ? countdownTargetIn(selfTz, countdown.target_date) : null
  const cdPct = countdown && cdTarget
    ? Math.max(0, Math.min(100, ((Date.now() - new Date(countdown.created_at).getTime()) / Math.max(1, cdTarget.getTime() - new Date(countdown.created_at).getTime())) * 100))
    : 0
  // Jour civil de l'échéance CHEZ TOI : formatée en heure navigateur, la date
  // sautait d'un jour dès que le fuseau du navigateur divergeait du tien.
  const cdDateLabel = cdTarget ? formatLongDateFR(zonedCivilDate(selfTz, cdTarget)) : ''

  /* ─── Blocs ─── */
  const clockCard = (tz: string, city: string | null, time: string, k: string) => (
    <div key={k} className={`lux-card min-w-0 h-full flex flex-col justify-center rounded-2xl px-3 py-4 text-center transition-colors ${isNightIn(tz) ? 'bg-[#1A1714]' : ''}`} onMouseMove={shine} onMouseLeave={unshine}>
      <p className="font-display num text-[2rem] md:text-[2.25rem] tracking-tight leading-none text-[#F0EAE0]">{time}</p>
      <div className="mt-2 flex flex-col sm:flex-row items-center justify-center gap-x-2 gap-y-0.5 min-w-0">
        <SunArc tz={tz} />
        <span className="text-xs text-[#9B9287] whitespace-nowrap max-w-full truncate"><MapPin size={10} aria-hidden="true" className="inline -mt-0.5 mr-1" />{city || timezoneCity(tz)}</span>
      </div>
    </div>
  )

  const clocks = (
    <div className={`grid items-stretch gap-3 w-full ${partnerProfile ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' : 'grid-cols-1 max-w-[220px] mx-auto'}`}>
      {clockCard(profile.timezone, profile.location_city, time1, 'me')}
      {partnerProfile && (
        <>
          <div className="relative flex items-center justify-center min-w-[56px] sm:min-w-[64px]">
            <span className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[#D4A574]/30 to-transparent" aria-hidden="true" />
            <span className="relative num rounded-full bg-[#241F1A] px-2.5 py-1 text-[11px] font-medium text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.2)]">{timeDiff ?? '= heure'}</span>
          </div>
          {clockCard(partnerProfile.timezone, partnerProfile.location_city, time2, 'partner')}
        </>
      )}
    </div>
  )

  const hero = (
    <section className="text-center reveal" aria-labelledby="hero-title">
      <Ornament className="max-w-[220px] mx-auto mb-5" />
      <p className={`${EYEBROW} mb-3`}>{getGreeting(selfTz)} · <span className="first-letter:uppercase inline-block">{todayLabel}</span></p>
      <h1 id="hero-title" className="font-display-italic text-[2.6rem] md:text-[3.4rem] xl:text-[3.8rem] leading-[1.05] mb-7 gradient-text-live text-balance">
        {profile.display_name}
        {partnerProfile && <span className="font-display-italic text-[0.72em] text-[#D4A574]/85 mx-[0.18em] align-baseline">&amp;</span>}
        {partnerProfile?.display_name}
      </h1>
      <div className="max-w-[560px] mx-auto">{clocks}</div>
    </section>
  )

  const onboarding = !partnerProfile && (
    <section className="lux-card relative overflow-hidden rounded-[20px] p-5 md:p-6 text-center reveal" style={{ animationDelay: '50ms' }} onMouseMove={shine} onMouseLeave={unshine} aria-labelledby="onb-title">
      <div className="w-12 h-12 rounded-full bg-[rgba(212,165,116,0.12)] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.25)] flex items-center justify-center mx-auto mb-3">
        <Link2 size={20} className="text-[#D4A574]" aria-hidden="true" />
      </div>
      <h2 id="onb-title" className="font-display text-xl text-[#F0EAE0]">Il manque quelqu'un ici</h2>
      <p className="text-[13px] text-[#9B9287] mt-1.5 leading-relaxed max-w-[300px] mx-auto">
        Ton code d'invitation : <span className="font-mono tracking-widest text-[#F0EAE0]">{profile.partner_code}</span>.
        Partage-le, ou entre le sien pour vous lier.
      </p>
      <Link to="/settings" className={`${BTN_PRIMARY} mt-4`}>Inviter ou lier</Link>
    </section>
  )

  const countdownBlock = (
    <section className="lux-card relative overflow-hidden rounded-[20px] px-5 py-7 md:p-8 text-center reveal" style={{ animationDelay: '100ms' }} onMouseMove={shine} onMouseLeave={unshine} aria-labelledby="cd-title">
      {countdown ? (
        <>
          <h2 id="cd-title" className={`${EYEBROW} mb-2 inline-flex items-center gap-1.5`}>
            <Hourglass size={11} aria-hidden="true" className="text-[#D4A574]" />
            {remaining.passed ? 'On y est' : 'Prochaines retrouvailles'}
          </h2>
          <p className="font-display-italic text-[1.5rem] text-[#F0EAE0] mb-6 text-balance flex items-center justify-center gap-2.5 max-w-full">
            {countdown.emoji && <span className="emoji grid size-9 shrink-0 place-items-center rounded-full bg-[#D4A574]/10 text-[18px] not-italic shadow-[inset_0_0_0_1px_rgba(212,165,116,0.22)]" aria-hidden="true">{countdown.emoji}</span>}
            <span className="min-w-0">{countdown.title}</span>
          </p>

          {remaining.passed ? (
            <p className="font-display text-3xl gradient-text mb-1 inline-flex items-center gap-2"><PartyPopper size={24} aria-hidden="true" /> C'est aujourd'hui !</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 w-full max-w-[340px] mx-auto">
              {[
                { v: remaining.days, l: remaining.days > 1 ? 'jours' : 'jour', pad: 0, anim: true },
                { v: remaining.hours, l: remaining.hours > 1 ? 'heures' : 'heure', pad: 2, anim: false },
                { v: remaining.minutes, l: 'min', pad: 2, anim: false },
              ].map(({ v, l, pad, anim }) => (
                <div key={l} className="flex flex-col items-center">
                  <span className="font-display num text-[52px] md:text-[60px] leading-[0.95] text-[#F0EAE0]">
                    {anim ? <CountUp to={v} ms={900} /> : String(v).padStart(pad, '0')}
                  </span>
                  <span className="mt-2 text-[10px] tracking-[0.18em] uppercase text-[#9B9287]">{l}</span>
                </div>
              ))}
            </div>
          )}

          <div className="max-w-[300px] mx-auto mt-6">
            <div className="relative h-[3px] w-full rounded-full bg-[#F0EAE0]/[0.07]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(cdPct)} aria-label="Chemin parcouru vers les retrouvailles">
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#D4A574] to-[#C2788E] transition-[width] duration-1000" style={{ width: `${cdPct}%` }} />
              <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F0EAE0] shadow-[0_0_10px_2px_rgba(212,165,116,0.55)] transition-[left] duration-1000" style={{ left: `${cdPct}%` }} aria-hidden="true" />
            </div>
            <p className="mt-2 text-[11px] text-[#9B9287] num">{Math.round(cdPct)}% du chemin parcouru · <span className="first-letter:uppercase inline-block">{cdDateLabel}</span></p>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <button onClick={() => setShowCountdownForm(true)} className="btn-tertiary"><Plus size={12} aria-hidden="true" /> Une autre date</button>
            <button onClick={removeCountdown} className="btn-tertiary" aria-label="Retirer ce compte à rebours"><X size={12} aria-hidden="true" /> Retirer</button>
          </div>
        </>
      ) : (
        <button onClick={() => setShowCountdownForm(true)} className="w-full py-3 text-center group/cd rounded-xl">
          <span className={`${EYEBROW} mb-3 inline-flex items-center gap-1.5`}><Timer size={11} aria-hidden="true" className="text-[#D4A574]" /> Prochaines retrouvailles</span>
          <span className="block font-display-italic text-xl text-[#F0EAE0]/90 group-hover/cd:text-[#F0EAE0] transition-colors">Quand est-ce qu'on se revoit ?</span>
          <span className="mt-3 inline-flex items-center gap-2 text-[13px] text-[#D4A574]"><Plus size={14} aria-hidden="true" /> Ajouter une date à attendre ensemble</span>
        </button>
      )}
    </section>
  )

  const callAgo = incomingCall ? formatDistanceToNow(new Date(incomingCall.created_at), { addSuffix: true, locale: fr }) : ''

  // Écho français sous le sélecteur natif de la date des retrouvailles
  const cdDateEcho = describeDateInput(cdDate)

  const callBlock = (
    <section className="lux-card rounded-[20px] relative reveal overflow-hidden px-5 py-8 md:p-8 flex flex-col items-center text-center" style={{ animationDelay: '150ms' }} onMouseMove={shine} onMouseLeave={unshine} aria-labelledby="call-title">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <div className="w-[22rem] h-[22rem] rounded-full animate-glow-breath" style={{ background: 'radial-gradient(closest-side, rgba(212,165,116,0.10), rgba(212,165,116,0.03) 50%, transparent 72%)' }} />
      </div>

      <h2 id="call-title" className={`${EYEBROW} mb-5 inline-flex items-center gap-1.5 relative`}>
        <PhoneCall size={11} aria-hidden="true" className="text-[#D4A574]" /> Envie d'appel
      </h2>

      {/* ─ Carte mise en avant : le partenaire a envie de te parler (ou il arrive) ─ */}
      {incomingCall && (
        <div className="relative w-full max-w-[420px] mb-6 rounded-2xl p-4 md:p-5 text-left animate-fade-in bg-[rgba(212,165,116,0.09)] shadow-[inset_0_0_0_1px_rgba(232,201,160,0.45)]" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#D4A574]/15 text-[18px] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.3)]" aria-hidden="true">💬</span>
            <div className="min-w-0 flex-1">
              <p className="font-display-italic text-[1.15rem] leading-snug text-[#F0EAE0]">
                {incomingIsJoining
                  ? `${partnerProfile?.display_name} arrive !`
                  : `${partnerProfile?.display_name} a envie de te parler`}
              </p>
              <p className="mt-0.5 text-[12px] text-[#C9A98A]">{callAgo}</p>
            </div>
          </div>
          {incomingIsJoining ? (
            <div className="mt-3 flex justify-end">
              <button onClick={dismissCall} className={`${BTN_GHOST} px-4`}>Top, à tout de suite</button>
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={dismissCall} className="btn-tertiary">Plus tard</button>
              <button onClick={joinCall} disabled={sendingCall} className={`${BTN_PRIMARY} px-4`}>
                <Check size={15} aria-hidden="true" /> Je te rejoins
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─ Bouton principal : lancer une envie d'appel ─ */}
      <button
        onClick={sendCall}
        disabled={sendingCall || !partnerProfile || callsLeftToday === 0}
        aria-label={partnerProfile ? `Dire à ${partnerProfile.display_name} que tu as envie de lui parler` : 'Lie ton/ta partenaire pour envoyer une envie d’appel'}
        title={partnerProfile ? (callsLeftToday === 0 ? 'Plafond du jour atteint' : "J'ai envie de te parler") : 'Lie ton/ta partenaire d’abord'}
        className="relative z-10 group/call inline-flex flex-col items-center gap-3 rounded-3xl px-8 py-7 transition-all duration-300 ease-out bg-white/[0.03] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.08)] hover:bg-[rgba(212,165,116,0.08)] hover:shadow-[inset_0_0_0_1px_rgba(232,201,160,0.4)] active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white/[0.03]"
      >
        <span className="grid size-20 place-items-center rounded-full bg-gradient-to-br from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_16px_40px_-16px_rgba(194,120,142,0.75)] transition-transform duration-300 group-hover/call:-translate-y-0.5 group-active/call:scale-95">
          <PhoneCall size={30} aria-hidden="true" className={sendingCall ? 'animate-pulse' : ''} />
        </span>
        <span className="font-display-italic text-[1.35rem] text-[#F0EAE0]">J'ai envie de te parler</span>
      </button>

      <p className="mt-4 min-h-[1.25rem] text-[13px] text-[#9B9287]" aria-live="polite">
        {sentMsg
          ? <span className="text-[#E8C9A0] animate-fade-in">{sentMsg}</span>
          : !partnerProfile
            ? 'Lie ton/ta partenaire pour lui envoyer un signal.'
            : callsLeftToday === 0
              ? `Tu as épuisé tes ${DAILY_SIGNAL_LIMIT} envies d'appel du jour — garde-en pour demain.`
              : callsLeftToday <= CALL_QUOTA_WARN_AT
                ? `Encore ${callsLeftToday} envie${callsLeftToday > 1 ? 's' : ''} d'appel aujourd'hui.`
                : <>Un signal instantané — ça s'allume tout de suite chez {partnerProfile.display_name}.</>}
      </p>

      {/* Série : jours civils consécutifs (dans TON fuseau) où vous vous êtes fait signe tous les deux */}
      {streak > 0 && (
        <p className="mt-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(232,184,109,0.10)] text-[#E8B86D] text-xs">
            <Flame size={12} aria-hidden="true" />
            <span className="num">{streak} jour{streak > 1 ? 's' : ''} d'affilée</span>
          </span>
        </p>
      )}

      {daysTogether !== null && daysTogether >= 0 && (
        <p className="mt-6 flex items-baseline justify-center gap-2 text-[11px] tracking-[0.2em] uppercase text-[#9B9287]">
          <span>Jour</span>
          <CountUp to={daysTogether + 1} ms={1400} className="font-display text-[19px] tracking-normal text-[#E0B98A]" />
          <span>ensemble</span>
        </p>
      )}
    </section>
  )

  const questionBlock = question && (
    <section className="lux-card rounded-[20px] p-5 md:p-6 text-center reveal" style={{ animationDelay: '250ms' }} onMouseMove={shine} onMouseLeave={unshine} aria-labelledby="q-title">
      <h2 id="q-title" className={`${EYEBROW} mb-4`}>Question du jour</h2>
      <span className="block font-display text-5xl leading-[0.6] text-[#D4A574]/40 select-none mb-1" aria-hidden="true">“</span>
      <p className="font-display-italic text-[1.45rem] md:text-[1.6rem] leading-snug max-w-md mx-auto text-[#F0EAE0] text-balance">
        {question.question.replace(/\s*\?\s*$/, ' ?')}
      </p>

      <div className="mt-5">
        {savedAnswer ? (
          <div className="space-y-3 text-left">
            <div className="rounded-xl p-4 bg-white/[0.04]">
              <p className="text-[11px] text-[#D4A574] uppercase tracking-wider mb-1.5">Toi</p>
              <p className="text-sm leading-relaxed text-[#F0EAE0]/90 whitespace-pre-wrap">{savedAnswer}</p>
            </div>
            {partnerAnswer ? (
              <div className="rounded-xl p-4 bg-white/[0.04] animate-fade-in">
                <p className="text-[11px] text-[#D99AAD] uppercase tracking-wider mb-1.5">{partnerProfile?.display_name}</p>
                <p className="text-sm leading-relaxed text-[#F0EAE0]/90 whitespace-pre-wrap">{partnerAnswer}</p>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-[#9B9287] text-xs py-2">
                <Lock size={12} aria-hidden="true" />
                <span>{partnerProfile ? `En attente de ${partnerProfile.display_name}` : 'Lie ton/ta partenaire pour comparer vos réponses'}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <input type="text" value={myAnswer} onChange={e => setMyAnswer(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitAnswer()}
              placeholder="Ta réponse…" aria-label="Ta réponse à la question du jour" maxLength={2000} className={`${INPUT} flex-1`} />
            <button onClick={submitAnswer} disabled={!myAnswer.trim() || answering} className={`${BTN_PRIMARY} px-4 shrink-0`} aria-label="Envoyer ma réponse">
              <Send size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        <p className="text-[11px] text-[#9B9287] mt-4">La réponse de l'autre n'apparaît qu'une fois que vous avez répondu tous les deux.</p>
      </div>
    </section>
  )

  const gratitudeBlock = (
    <div className="reveal" style={{ animationDelay: '300ms' }}>
      <GratitudeWidget />
    </div>
  )

  const loveNoteBlock = (
    <div className="reveal" style={{ animationDelay: '50ms' }}><LoveNoteWidget /></div>
  )

  return (
    <div className="mx-auto px-5 py-7 md:py-10 max-w-2xl xl:max-w-[1160px] xl:px-10">
      {/* Mobile / tablette : une colonne ; desktop large : grille asymétrique 7/5 */}
      <div className="xl:grid xl:grid-cols-12 xl:gap-6 space-y-6 xl:space-y-0">
        <div className="xl:col-span-12 mb-2 xl:mb-4">{hero}</div>
        <div className="xl:col-span-12 empty:hidden"><CurrentActivityBanner className="reveal" /></div>
        {onboarding && <div className="xl:col-span-12">{onboarding}</div>}

        <div className="xl:col-span-7 space-y-6">
          {countdownBlock}
          {callBlock}
          {questionBlock}
        </div>
        <aside className="xl:col-span-5 space-y-6">
          {loveNoteBlock}
          <div className="reveal" style={{ animationDelay: '150ms' }}><AvailabilityWidget /></div>
          <div className="reveal" style={{ animationDelay: '200ms' }}><HamsterMoodWidget /></div>
          {gratitudeBlock}
        </aside>
      </div>

      {showCountdownForm && (
        <Modal title="Prochaines retrouvailles" description="Une date à attendre ensemble — elle s'affichera en haut de votre accueil à tous les deux." onClose={() => setShowCountdownForm(false)}>
          <form onSubmit={saveCountdown} className="space-y-4">
            <div>
              {/* `cd-title` est déjà l'identifiant du titre de la section (aria-labelledby) :
                  le champ porte le sien, sinon le libellé « Quoi ? » ne focalisait rien. */}
              <label htmlFor="cd-title-input" className={LABEL}>Quoi ?</label>
              <input id="cd-title-input" type="text" value={cdTitle} onChange={(e) => setCdTitle(e.target.value)} placeholder="Ex : Week-end au Touquet" maxLength={80} required className={INPUT} />
            </div>
            <div>
              <label htmlFor="cd-date" className={LABEL}>Quand ?</label>
              <input id="cd-date" type="date" value={cdDate} onChange={(e) => setCdDate(e.target.value)} min={todayKey} required className={INPUT} lang="fr-FR" aria-describedby="cd-when" />
              {/* Le sélecteur natif s'affiche au format du système (souvent mm/jj/aaaa) :
                  on relit la date choisie en toutes lettres, en français, juste en dessous. */}
              <p id="cd-when" className="mt-1.5 text-[12px] text-[#F0EAE0]/70 min-h-[16px]" aria-live="polite">
                {cdDateEcho && (
                  <>
                    <Hourglass size={12} className="inline-block align-[-1px] mr-1.5 text-[#D4A574]" aria-hidden="true" />
                    {capitalizeFirst(cdDateEcho)}
                  </>
                )}
              </p>
            </div>
            <div>
              <span className={LABEL}>Emoji</span>
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Emoji">
                {COUNTDOWN_EMOJIS.map((e) => (
                  <button type="button" key={e} onClick={() => setCdEmoji(e)} role="radio" aria-checked={cdEmoji === e} aria-label={`Emoji ${e}`}
                    className={`h-12 rounded-xl text-xl transition-all duration-200 ${cdEmoji === e ? 'bg-[rgba(212,165,116,0.15)] shadow-[inset_0_0_0_1.5px_#E8C9A0]' : 'bg-white/[0.03] hover:bg-[rgba(212,165,116,0.08)]'}`}>
                    <span className="emoji">{e}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1 sticky bottom-0">
              <button type="button" onClick={() => setShowCountdownForm(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
              <button type="submit" disabled={cdSaving || !cdTitle.trim() || !cdDate} className={`${BTN_PRIMARY} flex-1`}>
                {cdSaving ? 'Enregistrement…' : 'Lancer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

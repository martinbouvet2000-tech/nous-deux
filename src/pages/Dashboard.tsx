import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Heart, MapPin, Timer, Send, Lock, Plus, X, Link2, PartyPopper, Flame, Hourglass } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { differenceInDays, differenceInHours, differenceInMinutes, isPast, format, parseISO } from 'date-fns'
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
import { timezoneDiffLabel, timezoneCity, formatTimeIn } from '@/lib/timezone'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL, EYEBROW } from '@/lib/ui'
import Ornament from '@/components/ui/Ornament'
import CountUp from '@/components/ui/CountUp'
import { shine, unshine } from '@/lib/shine'
import { utcOffsetMinutes } from '@/lib/timezone'

/* ═══ Helpers ═══ */
function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Bonne nuit'
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

function todayISO() {
  return format(new Date(), 'yyyy-MM-dd')
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

interface BurstHeart { id: number; bx: string; by: string; br: string; size: number; delay: number; hue: string }
let burstSeq = 0
function makeBurst(n = 14): BurstHeart[] {
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.6
    const dist = 70 + Math.random() * 70
    return {
      id: ++burstSeq,
      bx: `${Math.cos(ang) * dist}px`,
      by: `${Math.sin(ang) * dist - 30}px`,
      br: `${(Math.random() - 0.5) * 120}deg`,
      size: 8 + Math.random() * 10,
      delay: Math.random() * 120,
      hue: Math.random() < 0.55 ? '#D4A574' : '#D99AAD',
    }
  })
}

/* ═══ DASHBOARD ═══ */
export default function Dashboard() {
  const { profile, partnerProfile } = useAuthStore()
  const [time1, setTime1] = useState('')
  const [time2, setTime2] = useState('')

  // Tap state
  const [tapped, setTapped] = useState(false)
  const [todayCount, setTodayCount] = useState(0)
  const [partnerTodayCount, setPartnerTodayCount] = useState(0)
  const [receivedTap, setReceivedTap] = useState(false)
  const [streak, setStreak] = useState(0)
  const [burst, setBurst] = useState<BurstHeart[]>([])

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

  const daysTogether = profile?.relationship_start
    ? differenceInDays(new Date(), parseISO(profile.relationship_start))
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

  // Countdown ticker (minute)
  useEffect(() => {
    if (!countdown) return
    const target = new Date(countdown.target_date)
    setRemaining(computeRemaining(target))
    const i = setInterval(() => setRemaining(computeRemaining(target)), 30_000)
    return () => clearInterval(i)
  }, [countdown])

  // Load all data
  const loadAll = useCallback(async () => {
    if (!profile) return
    const today = todayISO()

    // Taps
    const { count: myTaps } = await supabase
      .from('taps').select('*', { count: 'exact', head: true })
      .eq('sender_id', profile.id).gte('created_at', today)
    setTodayCount(myTaps ?? 0)

    if (partnerProfile) {
      const { count: pTaps } = await supabase
        .from('taps').select('*', { count: 'exact', head: true })
        .eq('sender_id', partnerProfile.id).eq('receiver_id', profile.id).gte('created_at', today)
      setPartnerTodayCount(pTaps ?? 0)

      // Streak : jours consécutifs où on s'est TOUS LES DEUX envoyé une pensée
      const since = new Date(); since.setDate(since.getDate() - 60)
      const { data: md } = await supabase.from('taps').select('created_at')
        .eq('sender_id', profile.id).gte('created_at', since.toISOString())
      const { data: pd } = await supabase.from('taps').select('created_at')
        .eq('sender_id', partnerProfile.id).eq('receiver_id', profile.id).gte('created_at', since.toISOString())
      const myD = new Set((md ?? []).map(t => format(new Date(t.created_at), 'yyyy-MM-dd')))
      const pD = new Set((pd ?? []).map(t => format(new Date(t.created_at), 'yyyy-MM-dd')))
      let s = 0
      for (let i = 0; i < 60; i++) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const ds = format(d, 'yyyy-MM-dd')
        if (myD.has(ds) && pD.has(ds)) s++
        else if (i === 0) continue // aujourd'hui pas encore fait → on ne casse pas la série
        else break
      }
      setStreak(s)
    }

    // Countdown (prochain à venir en priorité, sinon le dernier passé)
    const { data: cd } = await supabase.from('countdowns').select('*')
      .eq('is_active', true).order('target_date', { ascending: true })
    if (cd && cd.length > 0) {
      const upcoming = cd.find(c => !isPast(new Date(c.target_date)))
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
  }, [profile, partnerProfile])

  useEffect(() => {
    if (!profile) return
    loadAll()
    const ch = supabase.channel(`dash:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taps', filter: `receiver_id=eq.${profile.id}` }, () => {
        setReceivedTap(true); setTimeout(() => setReceivedTap(false), 3000); loadAll()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'countdowns' }, () => loadAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'question_answers' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile, partnerProfile, loadAll])

  const sendTap = async () => {
    if (!profile || !partnerProfile || tapped) return
    setTapped(true)
    setBurst(makeBurst())
    setTimeout(() => setBurst([]), 1300)
    try { navigator.vibrate?.(12) } catch { /* non supporté */ }
    const { ok } = await run(
      supabase.from('taps').insert({ sender_id: profile.id, receiver_id: partnerProfile.id }),
      { errorMessage: "Impossible d'envoyer ta pensée." },
    )
    if (ok) setTodayCount(c => c + 1)
    setTimeout(() => setTapped(false), 2000)
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
    // Date choisie = fin de journée locale, pour que "J-0" tienne toute la journée
    const target = new Date(`${cdDate}T23:59:00`)
    const { ok } = await run(
      supabase.from('countdowns').insert({ created_by: profile.id, title: cdTitle.trim(), target_date: target.toISOString(), emoji: cdEmoji, is_active: true }),
      { errorMessage: 'Impossible de créer le compte à rebours.' },
    )
    setCdSaving(false)
    if (ok) {
      toast.success('Compte à rebours lancé ✨')
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
  const todayLabel = format(new Date(), 'EEEE d MMMM', { locale: fr })

  const cdPct = countdown
    ? Math.max(0, Math.min(100, ((Date.now() - new Date(countdown.created_at).getTime()) / Math.max(1, new Date(countdown.target_date).getTime() - new Date(countdown.created_at).getTime())) * 100))
    : 0

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
      <p className={`${EYEBROW} mb-3`}>{getGreeting()} · <span className="first-letter:uppercase inline-block">{todayLabel}</span></p>
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
            <p className="mt-2 text-[11px] text-[#9B9287] num">{Math.round(cdPct)}% du chemin parcouru · <span className="first-letter:uppercase inline-block">{format(new Date(countdown.target_date), 'EEEE d MMMM yyyy', { locale: fr })}</span></p>
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

  const heartBlock = (
    <section className="lux-card rounded-[20px] text-center py-10 xl:py-12 px-4 relative reveal flex flex-col items-center justify-center overflow-hidden min-h-[480px] xl:min-h-[520px]" style={{ animationDelay: '150ms' }} aria-label="Je pense à toi">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <div className="w-[22rem] h-[22rem] rounded-full animate-glow-breath" style={{ background: 'radial-gradient(closest-side, rgba(212,165,116,0.10), rgba(212,165,116,0.03) 50%, transparent 72%)' }} />
      </div>

      <div className="relative inline-flex items-center justify-center mb-7 w-56 h-56">
        {/* Anneau de progression : % du chemin vers les retrouvailles */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 200 200" fill="none" aria-hidden="true">
          <circle cx="100" cy="100" r="92" stroke="rgba(240,234,224,0.07)" strokeWidth="1.5" strokeDasharray="1 6" strokeLinecap="round" />
          {countdown && !remaining.passed && (
            <circle cx="100" cy="100" r="92" stroke="url(#ringG)" strokeWidth="2" strokeLinecap="round" strokeDasharray="578" strokeDashoffset={578 * (1 - cdPct / 100)} style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' }} />
          )}
          <defs><linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#D4A574" /><stop offset="1" stopColor="#C2788E" /></linearGradient></defs>
        </svg>
        <svg className="absolute w-40 h-40 animate-orbit-rev opacity-60" viewBox="0 0 200 200" fill="none" aria-hidden="true">
          <circle cx="100" cy="100" r="96" stroke="#D4A574" strokeOpacity="0.3" strokeWidth="0.8" strokeDasharray="1 14" />
          <circle cx="100" cy="4" r="2.2" fill="#E8C9A0" />
        </svg>

        <div className={`absolute w-36 h-36 rounded-full transition-all duration-1000 ${
          tapped ? 'bg-secondary/20 scale-125 blur-xl' : receivedTap ? 'bg-secondary/12 scale-115 blur-lg' : 'bg-primary/[0.04] animate-heart-breath'
        }`} aria-hidden="true" />

        {burst.map((b) => (
          <span key={b.id} className="absolute animate-burst pointer-events-none" style={{ ['--bx' as string]: b.bx, ['--by' as string]: b.by, ['--br' as string]: b.br, animationDelay: `${b.delay}ms`, color: b.hue }} aria-hidden="true">
            <Heart size={b.size} fill="currentColor" strokeWidth={0} />
          </span>
        ))}

        <button
          onClick={sendTap}
          aria-disabled={tapped || !partnerProfile}
          aria-label={partnerProfile ? `Envoyer « je pense à toi » à ${partnerProfile.display_name}` : 'Lie ton/ta partenaire pour envoyer une pensée'}
          title={partnerProfile ? 'Je pense à toi' : 'Lie ton/ta partenaire d’abord'}
          className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ease-out ${
            tapped ? 'scale-115' : receivedTap ? 'scale-108' : 'hover:scale-105 active:scale-90'
          } ${!partnerProfile ? 'cursor-not-allowed' : ''}`}
        >
          <svg width="84" height="77" viewBox="0 0 64 58" aria-hidden="true" className={`transition-all duration-700 ${tapped || receivedTap ? '' : 'animate-heart-glow'}`}>
            <defs>
              <linearGradient id="heartFill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={tapped || receivedTap ? '#E8B4C0' : '#E8C9A0'} />
                <stop offset="0.55" stopColor={tapped || receivedTap ? '#C2788E' : '#D4A574'} />
                <stop offset="1" stopColor={tapped || receivedTap ? '#A85C74' : '#C2788E'} />
              </linearGradient>
              <radialGradient id="heartLight" cx="0.35" cy="0.3" r="0.6">
                <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path d="M32 56c-.9 0-1.7-.3-2.4-.9C20 46.9 12 40 12 31.1 12 24.9 16.7 20.5 22.6 20.5c3.7 0 7.1 1.9 9.4 5 2.3-3.1 5.7-5 9.4-5C47.3 20.5 52 24.9 52 31.1c0 8.9-8 15.8-17.6 24-.7.6-1.5.9-2.4.9z" transform="translate(0,-14)" fill="url(#heartFill)" opacity={partnerProfile ? 1 : 0.45} />
            <path d="M32 56c-.9 0-1.7-.3-2.4-.9C20 46.9 12 40 12 31.1 12 24.9 16.7 20.5 22.6 20.5c3.7 0 7.1 1.9 9.4 5 2.3-3.1 5.7-5 9.4-5C47.3 20.5 52 24.9 52 31.1c0 8.9-8 15.8-17.6 24-.7.6-1.5.9-2.4.9z" transform="translate(0,-14)" fill="url(#heartLight)" />
          </svg>
        </button>
      </div>

      <p className="font-display-italic text-lg tracking-wide mb-3 text-[#F0EAE0]/85">
        {tapped ? <span className="text-secondary animate-fade-in">Envoyé avec amour</span>
          : receivedTap ? <span className="text-secondary animate-fade-in">{partnerProfile?.display_name} pense à toi</span>
          : 'Je pense à toi'}
      </p>
      <span className="sr-only" aria-live="polite">{tapped ? 'Pensée envoyée' : receivedTap ? `${partnerProfile?.display_name} pense à toi` : ''}</span>

      <div className="flex items-center justify-center gap-2 text-xs text-[#9B9287]">
        {streak > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(232,184,109,0.10)] text-[#E8B86D]">
            <Flame size={12} aria-hidden="true" />
            <span className="num">{streak} jour{streak > 1 ? 's' : ''} d'affilée</span>
          </span>
        )}
        {todayCount > 0 && <span className="px-2.5 py-1 rounded-full bg-white/[0.04] num">{todayCount} envoyé{todayCount > 1 ? 's' : ''}</span>}
        {partnerTodayCount > 0 && <span className="px-2.5 py-1 rounded-full bg-white/[0.04] num">{partnerTodayCount} reçu{partnerTodayCount > 1 ? 's' : ''}</span>}
      </div>

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
          {heartBlock}
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
              <label htmlFor="cd-title" className={LABEL}>Quoi ?</label>
              <input id="cd-title" type="text" value={cdTitle} onChange={(e) => setCdTitle(e.target.value)} placeholder="Ex : Week-end au Touquet" maxLength={80} required className={INPUT} />
            </div>
            <div>
              <label htmlFor="cd-date" className={LABEL}>Quand ?</label>
              <input id="cd-date" type="date" value={cdDate} onChange={(e) => setCdDate(e.target.value)} min={todayISO()} required className={INPUT} lang="fr-FR" />
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

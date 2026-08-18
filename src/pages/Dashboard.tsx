import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Heart, MapPin, Timer, Send, Lock, MessageCircle, Plus, X, Link2, PartyPopper } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { differenceInDays, differenceInHours, differenceInMinutes, isPast, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Countdown, Mood, DailyQuestion } from '@/types/database'
import LoveNoteWidget from '@/components/Dashboard/LoveNoteWidget'
import GratitudeWidget from '@/components/Dashboard/GratitudeWidget'
import Modal from '@/components/ui/Modal'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { timezoneDiffLabel, timezoneCity, formatTimeIn } from '@/lib/timezone'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL } from '@/lib/ui'

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

const MOODS = [
  { emoji: '😊', label: 'Heureux·se' },
  { emoji: '🥰', label: 'Amoureux·se' },
  { emoji: '😌', label: 'Serein·e' },
  { emoji: '😴', label: 'Fatigué·e' },
  { emoji: '😔', label: 'Triste' },
  { emoji: '😤', label: 'Frustré·e' },
  { emoji: '🤩', label: 'Excité·e' },
  { emoji: '🥳', label: 'Festif·ve' },
]

const COUNTDOWN_EMOJIS = ['❤️', '✈️', '🏠', '🎉', '🎂', '💍', '🌅', '🎄']

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

  // Countdown
  const [countdown, setCountdown] = useState<Countdown | null>(null)
  const [remaining, setRemaining] = useState({ days: 0, hours: 0, minutes: 0, passed: false })
  const [showCountdownForm, setShowCountdownForm] = useState(false)
  const [cdTitle, setCdTitle] = useState('')
  const [cdDate, setCdDate] = useState('')
  const [cdEmoji, setCdEmoji] = useState('❤️')
  const [cdSaving, setCdSaving] = useState(false)

  // Mood
  const [myMood, setMyMood] = useState<Mood | null>(null)
  const [partnerMood, setPartnerMood] = useState<Mood | null>(null)
  const [showMoodPicker, setShowMoodPicker] = useState(false)

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

    // Moods
    const { data: mm } = await supabase.from('moods').select('*')
      .eq('user_id', profile.id).gte('created_at', today)
      .order('created_at', { ascending: false }).limit(1)
    setMyMood(mm?.[0] ?? null)

    if (partnerProfile) {
      const { data: pm } = await supabase.from('moods').select('*')
        .eq('user_id', partnerProfile.id).gte('created_at', today)
        .order('created_at', { ascending: false }).limit(1)
      setPartnerMood(pm?.[0] ?? null)
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moods', filter: partnerProfile ? `user_id=eq.${partnerProfile.id}` : `user_id=eq.${profile.id}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'countdowns' }, () => loadAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'question_answers' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile, partnerProfile, loadAll])

  const sendTap = async () => {
    if (!profile || !partnerProfile || tapped) return
    setTapped(true)
    const { ok } = await run(
      supabase.from('taps').insert({ sender_id: profile.id, receiver_id: partnerProfile.id }),
      { errorMessage: "Impossible d'envoyer ta pensée." },
    )
    if (ok) setTodayCount(c => c + 1)
    setTimeout(() => setTapped(false), 2000)
  }

  const selectMood = async (emoji: string, label: string) => {
    if (!profile) return
    const { ok } = await run(supabase.from('moods').insert({ user_id: profile.id, emoji, label }))
    if (ok) { setShowMoodPicker(false); loadAll() }
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

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 animate-fade-in">

      {/* ════════ SECTION 1: Greeting + Clocks ════════ */}
      <section className="text-center mb-8 pt-4">
        <p className="text-xs tracking-[0.25em] uppercase text-text-dim/80 mb-4">{getGreeting()}</p>
        <h1 className="text-3xl md:text-[2.5rem] font-light tracking-tight mb-7 gradient-text leading-tight">
          {profile.display_name}
          {partnerProfile && <span className="text-text-dim/50 mx-2 font-extralight">&</span>}
          {partnerProfile?.display_name}
        </h1>

        <div className="flex items-center justify-center gap-8 text-sm">
          <div className="text-center">
            <p className="text-2xl font-light tabular-nums tracking-tight">{time1}</p>
            <p className="text-xs text-text-dim mt-1 flex items-center justify-center gap-1">
              <MapPin size={10} aria-hidden="true" />
              {profile.location_city || timezoneCity(profile.timezone)}
            </p>
          </div>
          {partnerProfile && (
            <>
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 h-px bg-gradient-to-r from-transparent via-text-dim/30 to-transparent" />
                <span className="text-[11px] text-text-dim">{timeDiff ?? 'même heure'}</span>
              </div>
              <div className="text-center">
                <p className="text-2xl font-light tabular-nums tracking-tight">{time2}</p>
                <p className="text-xs text-text-dim mt-1 flex items-center justify-center gap-1">
                  <MapPin size={10} aria-hidden="true" />
                  {partnerProfile.location_city || timezoneCity(partnerProfile.timezone)}
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ════════ Onboarding — pas encore de partenaire ════════ */}
      {!partnerProfile && (
        <section className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] mb-6 text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(212,165,116,0.05)] to-[rgba(194,120,142,0.04)] pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-[rgba(212,165,116,0.12)] flex items-center justify-center mx-auto mb-3">
              <Link2 size={20} className="text-[#D4A574]" aria-hidden="true" />
            </div>
            <p className="text-sm text-[#F0EAE0] font-medium">Il manque quelqu'un ici</p>
            <p className="text-xs text-[#9B9287] mt-1.5 leading-relaxed max-w-[300px] mx-auto">
              Ton code d'invitation : <span className="font-mono tracking-widest text-[#F0EAE0]">{profile.partner_code}</span>.
              Partage-le, ou entre le sien pour vous lier.
            </p>
            <Link to="/settings" className={`${BTN_PRIMARY} mt-4`}>Inviter ou lier</Link>
          </div>
        </section>
      )}

      {/* ════════ Love Note ════════ */}
      <LoveNoteWidget />

      {/* ════════ SECTION 2: Heart ════════ */}
      <section className="text-center py-16 mb-2 relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-64 h-64 rounded-full bg-primary/[0.04] blur-[80px] animate-glow-breath" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-40 h-40 rounded-full bg-secondary/[0.06] blur-[60px] animate-glow-breath" style={{ animationDelay: '2s' }} />
        </div>

        <div className="relative inline-flex items-center justify-center mb-8">
          <div className={`absolute w-36 h-36 rounded-full transition-all duration-1000 ${
            tapped ? 'bg-secondary/20 scale-125 blur-xl' : receivedTap ? 'bg-secondary/12 scale-115 blur-lg' : 'border border-primary/[0.08] animate-heart-breath'
          }`} aria-hidden="true" />
          <div className={`absolute w-28 h-28 rounded-full transition-all duration-700 ${
            tapped ? 'bg-secondary/15 scale-110' : receivedTap ? 'bg-secondary/10 scale-105' : 'bg-primary/[0.03]'
          }`} aria-hidden="true" />

          <button
            onClick={sendTap}
            disabled={tapped || !partnerProfile}
            aria-label={partnerProfile ? `Envoyer « je pense à toi » à ${partnerProfile.display_name}` : 'Lie ton/ta partenaire pour envoyer une pensée'}
            title={partnerProfile ? 'Je pense à toi' : 'Lie ton/ta partenaire d’abord'}
            className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/50 ${
              tapped ? 'scale-115' : receivedTap ? 'scale-108' : 'hover:scale-105 active:scale-90'
            } disabled:cursor-not-allowed`}
          >
            <Heart
              size={46}
              strokeWidth={1.2}
              aria-hidden="true"
              className={`transition-all duration-700 ease-out ${
                tapped
                  ? 'text-secondary fill-secondary drop-shadow-[0_0_20px_rgba(194,120,142,0.5)]'
                  : receivedTap
                    ? 'text-secondary/90 fill-secondary/90 drop-shadow-[0_0_15px_rgba(194,120,142,0.3)]'
                    : 'text-primary/50 fill-primary/20 hover:text-primary/80 hover:fill-primary/30 drop-shadow-[0_0_12px_rgba(212,165,116,0.15)]'
              }`}
            />
          </button>
        </div>

        <p className="text-[15px] font-light tracking-wide mb-2" aria-live="polite">
          {tapped ? (
            <span className="text-secondary/90 animate-fade-in">Envoyé avec amour</span>
          ) : receivedTap ? (
            <span className="text-secondary/80 animate-fade-in">{partnerProfile?.display_name} pense à toi</span>
          ) : (
            <span className="text-text-muted/70">Je pense à toi</span>
          )}
        </p>

        <div className="flex items-center justify-center gap-4 text-xs text-text-dim">
          {streak > 0 && (
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true">🔥</span>
              <span className="tabular-nums">{streak} jour{streak > 1 ? 's' : ''} d'affilée</span>
            </span>
          )}
          {todayCount > 0 && <span>{todayCount} envoyé{todayCount > 1 ? 's' : ''}</span>}
          {partnerTodayCount > 0 && <span>{partnerTodayCount} reçu{partnerTodayCount > 1 ? 's' : ''}</span>}
        </div>

        {daysTogether !== null && daysTogether >= 0 && (
          <p className="text-xs text-text-dim/70 mt-5 tracking-[0.15em] uppercase">
            Jour {daysTogether + 1} ensemble
          </p>
        )}
      </section>

      {/* ════════ SECTION 3: Countdown ════════ */}
      <section className="text-center py-8 mb-2 border-t border-b border-white/[0.04] relative group">
        {countdown ? (
          <>
            <p className="text-xs tracking-[0.2em] uppercase text-text-dim mb-1">
              <Timer size={10} className="inline mr-1 -mt-px" aria-hidden="true" />
              {remaining.passed ? 'On y est' : 'Prochaines retrouvailles'}
            </p>
            <p className="text-sm text-text-muted mb-4">{countdown.emoji} {countdown.title}</p>

            {remaining.passed ? (
              <div>
                <p className="text-2xl font-light gradient-text mb-1 inline-flex items-center gap-2"><PartyPopper size={22} aria-hidden="true" /> C'est aujourd'hui !</p>
              </div>
            ) : (
              <div className="flex items-baseline justify-center gap-6">
                {[
                  { v: remaining.days, l: remaining.days > 1 ? 'jours' : 'jour' },
                  { v: remaining.hours, l: remaining.hours > 1 ? 'heures' : 'heure' },
                  { v: remaining.minutes, l: 'min' },
                ].map(({ v, l }) => (
                  <div key={l} className="text-center">
                    <p className="text-4xl font-extralight tabular-nums tracking-tight">{v}</p>
                    <p className="text-[11px] tracking-[0.15em] uppercase text-text-dim mt-1">{l}</p>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-text-dim/80 mt-4 capitalize">
              {format(new Date(countdown.target_date), 'EEEE d MMMM yyyy', { locale: fr })}
            </p>

            <div className="mt-3 flex items-center justify-center gap-3">
              <button onClick={() => setShowCountdownForm(true)} className="text-xs text-text-dim hover:text-[#D4A574] transition-colors">
                + Un autre
              </button>
              <button onClick={removeCountdown} className="text-xs text-text-dim hover:text-red-300 transition-colors inline-flex items-center gap-1" aria-label="Retirer ce compte à rebours">
                <X size={11} aria-hidden="true" /> Retirer
              </button>
            </div>
          </>
        ) : (
          <button onClick={() => setShowCountdownForm(true)} className="w-full py-2 text-center group/cd">
            <p className="text-xs tracking-[0.2em] uppercase text-text-dim mb-2">
              <Timer size={10} className="inline mr-1 -mt-px" aria-hidden="true" />
              Prochaines retrouvailles
            </p>
            <p className="text-sm text-text-muted group-hover/cd:text-[#F0EAE0] transition-colors inline-flex items-center gap-2">
              <Plus size={14} className="text-[#D4A574]" aria-hidden="true" /> Ajouter une date à attendre ensemble
            </p>
          </button>
        )}
      </section>

      {/* ════════ SECTION 4: Mood ════════ */}
      <section className="py-6 mb-2">
        {showMoodPicker ? (
          <div className="text-center animate-fade-in">
            <p className="text-sm text-text-muted mb-4" id="mood-label">Comment te sens-tu ?</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xs mx-auto" role="group" aria-labelledby="mood-label">
              {MOODS.map(({ emoji, label }) => (
                <button
                  key={emoji}
                  onClick={() => selectMood(emoji, label)}
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-xl hover:bg-white/[0.05] active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/50"
                  title={label}
                  aria-label={label}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button onClick={() => setShowMoodPicker(false)} className="text-xs text-text-dim mt-3 hover:text-text-muted">
              Annuler
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => setShowMoodPicker(true)}
              className="flex items-center gap-2 hover:bg-white/[0.03] px-3 py-2 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/40"
              aria-label="Choisir mon humeur"
            >
              {myMood ? (
                <span className="text-2xl" aria-hidden="true">{myMood.emoji}</span>
              ) : (
                <span className="w-8 h-8 rounded-full border border-dashed border-white/[0.12] flex items-center justify-center text-text-dim text-xs" aria-hidden="true">?</span>
              )}
              <div className="text-left">
                <p className="text-xs text-text-muted">{profile.display_name}</p>
                <p className="text-xs text-text-dim">{myMood ? myMood.label : 'Définir mon humeur'}</p>
              </div>
            </button>

            {partnerProfile && (
              <>
                <div className="w-px h-6 bg-white/[0.06]" aria-hidden="true" />
                <div className="flex items-center gap-2 px-3 py-2">
                  {partnerMood ? (
                    <span className="text-2xl" aria-hidden="true">{partnerMood.emoji}</span>
                  ) : (
                    <span className="w-8 h-8 rounded-full border border-dashed border-white/[0.06] flex items-center justify-center" aria-hidden="true">
                      <Heart size={12} className="text-text-dim/40" />
                    </span>
                  )}
                  <div className="text-left">
                    <p className="text-xs text-text-muted">{partnerProfile.display_name}</p>
                    <p className="text-xs text-text-dim">{partnerMood ? partnerMood.label : 'En attente…'}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ════════ SECTION 5: Question du jour ════════ */}
      {question && (
        <section className="py-8 border-t border-white/[0.04]">
          <div className="text-center mb-6">
            <p className="text-xs tracking-[0.2em] uppercase text-text-dim mb-4">
              <MessageCircle size={10} className="inline mr-1 -mt-px" aria-hidden="true" />
              Question du jour
            </p>
            <p className="text-lg md:text-xl font-light italic leading-relaxed max-w-md mx-auto">
              {question.question}
            </p>
          </div>

          {savedAnswer ? (
            <div className="max-w-md mx-auto space-y-3">
              <div className="rounded-xl p-4 bg-white/[0.03]">
                <p className="text-xs text-primary uppercase tracking-wider mb-1.5">Toi</p>
                <p className="text-sm leading-relaxed text-text/80 whitespace-pre-wrap">{savedAnswer}</p>
              </div>
              {partnerAnswer ? (
                <div className="rounded-xl p-4 bg-white/[0.03] animate-fade-in">
                  <p className="text-xs text-secondary uppercase tracking-wider mb-1.5">{partnerProfile?.display_name}</p>
                  <p className="text-sm leading-relaxed text-text/80 whitespace-pre-wrap">{partnerAnswer}</p>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-text-dim text-xs py-3">
                  <Lock size={12} aria-hidden="true" />
                  <span>{partnerProfile ? `En attente de ${partnerProfile.display_name}` : 'Lie ton/ta partenaire pour comparer vos réponses'}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2 max-w-md mx-auto">
              <input
                type="text"
                value={myAnswer}
                onChange={e => setMyAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitAnswer()}
                placeholder="Ta réponse…"
                aria-label="Ta réponse à la question du jour"
                maxLength={2000}
                className={INPUT}
              />
              <button onClick={submitAnswer} disabled={!myAnswer.trim() || answering} className={`${BTN_PRIMARY} px-4`} aria-label="Envoyer ma réponse">
                <Send size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          <p className="text-center text-xs text-text-dim/70 mt-4">
            La réponse de l'autre n'apparaît qu'une fois que vous avez répondu tous les deux.
          </p>
        </section>
      )}

      {/* ════════ SECTION 6: Gratitude ════════ */}
      <div className="border-t border-white/[0.04] pt-6">
        <GratitudeWidget />
      </div>

      {/* ════════ Modal compte à rebours ════════ */}
      {showCountdownForm && (
        <Modal title="Prochaines retrouvailles" description="Une date à attendre ensemble — elle s'affichera en haut de votre accueil à tous les deux." onClose={() => setShowCountdownForm(false)}>
          <form onSubmit={saveCountdown} className="space-y-4">
            <div className="flex gap-2 flex-wrap" role="group" aria-label="Emoji">
              {COUNTDOWN_EMOJIS.map((e) => (
                <button type="button" key={e} onClick={() => setCdEmoji(e)} aria-label={`Emoji ${e}`} aria-pressed={cdEmoji === e}
                  className={`text-xl p-1.5 rounded-lg transition-all duration-300 ${cdEmoji === e ? 'bg-[rgba(212,165,116,0.15)] shadow-[0_0_12px_rgba(212,165,116,0.1)]' : 'hover:bg-[rgba(212,165,116,0.06)]'}`}>
                  {e}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="cd-title" className={LABEL}>Quoi ?</label>
              <input id="cd-title" type="text" value={cdTitle} onChange={(e) => setCdTitle(e.target.value)} placeholder="Ex : Week-end au Touquet" maxLength={80} required className={INPUT} />
            </div>
            <div>
              <label htmlFor="cd-date" className={LABEL}>Quand ?</label>
              <input id="cd-date" type="date" value={cdDate} onChange={(e) => setCdDate(e.target.value)} min={todayISO()} required className={INPUT} />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowCountdownForm(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
              <button type="submit" disabled={cdSaving || !cdTitle.trim() || !cdDate} className={`${BTN_PRIMARY} flex-1`}>
                {cdSaving ? 'Enregistrement…' : 'Lancer le compte à rebours'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

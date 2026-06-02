import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { Heart, MapPin, Timer, Send, Lock, Sparkles, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { differenceInDays, differenceInHours, differenceInMinutes, isPast, format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Countdown, Mood } from '@/types/database'
import LoveNoteWidget from '@/components/Dashboard/LoveNoteWidget'
import GratitudeWidget from '@/components/Dashboard/GratitudeWidget'

/* ═══ Helpers ═══ */
function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Bonne nuit'
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

function formatTime(tz: string) {
  return new Date().toLocaleTimeString('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
}

function formatDate(tz: string) {
  return new Date().toLocaleDateString('fr-FR', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
}

function getTimeDiff(tz1: string, tz2: string): string | null {
  const now = new Date()
  const d1 = new Date(now.toLocaleString('en-US', { timeZone: tz1 }))
  const d2 = new Date(now.toLocaleString('en-US', { timeZone: tz2 }))
  const diff = Math.round((d2.getTime() - d1.getTime()) / 3600000)
  return diff === 0 ? null : `${diff > 0 ? '+' : ''}${diff}h`
}

/* ═══ DASHBOARD ═══ */
export default function Dashboard() {
  const { profile, partnerProfile } = useAuthStore()
  const [time1, setTime1] = useState('')
  const [time2, setTime2] = useState('')
  const [date1, setDate1] = useState('')

  // Tap state
  const [tapped, setTapped] = useState(false)
  const [todayCount, setTodayCount] = useState(0)
  const [partnerTodayCount, setPartnerTodayCount] = useState(0)
  const [receivedTap, setReceivedTap] = useState(false)
  const [streak, setStreak] = useState(0)

  // Countdown
  const [countdown, setCountdown] = useState<Countdown | null>(null)
  const [remaining, setRemaining] = useState({ days: 0, hours: 0, minutes: 0, passed: false })

  // Mood
  const [myMood, setMyMood] = useState<Mood | null>(null)
  const [partnerMood, setPartnerMood] = useState<Mood | null>(null)
  const [showMoodPicker, setShowMoodPicker] = useState(false)

  // Question
  const [question, setQuestion] = useState<{ id: string; question: string } | null>(null)
  const [myAnswer, setMyAnswer] = useState('')
  const [savedAnswer, setSavedAnswer] = useState<string | null>(null)
  const [partnerAnswer, setPartnerAnswer] = useState<string | null>(null)

  const MOODS = [
    { emoji: '😊', label: 'Heureux' },
    { emoji: '🥰', label: 'Amoureux' },
    { emoji: '😌', label: 'Serein' },
    { emoji: '😴', label: 'Fatigué' },
    { emoji: '😔', label: 'Triste' },
    { emoji: '😤', label: 'Frustré' },
    { emoji: '🤩', label: 'Excité' },
    { emoji: '🥳', label: 'Festif' },
  ]

  const daysTogether = profile?.created_at
    ? differenceInDays(new Date(), new Date(profile.created_at))
    : 0

  // Clock tick
  useEffect(() => {
    if (!profile) return
    const tick = () => {
      setTime1(formatTime(profile.timezone))
      setDate1(formatDate(profile.timezone))
      if (partnerProfile) setTime2(formatTime(partnerProfile.timezone))
    }
    tick()
    const i = setInterval(tick, 1000)
    return () => clearInterval(i)
  }, [profile, partnerProfile])

  // Load all data
  const loadAll = useCallback(async () => {
    if (!profile) return
    const today = new Date().toISOString().split('T')[0]

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
    }

    // Streak
    if (partnerProfile) {
      const { data: md } = await supabase.from('taps').select('created_at')
        .eq('sender_id', profile.id).order('created_at', { ascending: false }).limit(60)
      const { data: pd } = await supabase.from('taps').select('created_at')
        .eq('sender_id', partnerProfile.id).eq('receiver_id', profile.id)
        .order('created_at', { ascending: false }).limit(60)
      const myD = new Set((md ?? []).map(t => t.created_at.split('T')[0]))
      const pD = new Set((pd ?? []).map(t => t.created_at.split('T')[0]))
      let s = 0
      for (let i = 0; i < 60; i++) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const ds = d.toISOString().split('T')[0]
        if (myD.has(ds) && pD.has(ds)) s++
        else if (i === 0) continue
        else break
      }
      setStreak(s)
    }

    // Countdown
    const { data: cd } = await supabase.from('countdowns').select('*')
      .eq('is_active', true).order('target_date', { ascending: true }).limit(1)
    if (cd?.[0]) {
      setCountdown(cd[0])
      const target = new Date(cd[0].target_date)
      if (isPast(target)) setRemaining({ days: 0, hours: 0, minutes: 0, passed: true })
      else setRemaining({
        days: differenceInDays(target, new Date()),
        hours: differenceInHours(target, new Date()) % 24,
        minutes: differenceInMinutes(target, new Date()) % 60,
        passed: false,
      })
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

    // Question
    let { data: q } = await supabase.from('daily_questions').select('*')
      .eq('date', today).limit(1).single()
    if (!q) {
      const { data: rq } = await supabase.from('question_bank').select('*').limit(1).single()
      if (rq) {
        const { data: nq } = await supabase.from('daily_questions')
          .insert({ question: rq.question, category: rq.category, date: today }).select().single()
        q = nq
      }
    }
    if (q) {
      setQuestion(q)
      const { data: ans } = await supabase.from('question_answers').select('*').eq('question_id', q.id)
      const mine = ans?.find(a => a.user_id === profile.id)
      const theirs = ans?.find(a => a.user_id === partnerProfile?.id)
      if (mine) setSavedAnswer(mine.answer)
      if (theirs && mine) setPartnerAnswer(theirs.answer)
    }
  }, [profile, partnerProfile])

  useEffect(() => {
    if (!profile) return
    loadAll()
    const ch = supabase.channel('dash-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taps', filter: `receiver_id=eq.${profile.id}` }, () => {
        setReceivedTap(true); setTimeout(() => setReceivedTap(false), 3000); loadAll()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moods' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile, loadAll])

  const sendTap = async () => {
    if (!profile || !partnerProfile || tapped) return
    await supabase.from('taps').insert({ sender_id: profile.id, receiver_id: partnerProfile.id })
    setTapped(true); setTodayCount(c => c + 1)
    setTimeout(() => setTapped(false), 2000)
  }

  const selectMood = async (emoji: string, label: string) => {
    if (!profile) return
    await supabase.from('moods').insert({ user_id: profile.id, emoji, label })
    setShowMoodPicker(false); loadAll()
  }

  const submitAnswer = async () => {
    if (!profile || !question || !myAnswer.trim()) return
    await supabase.from('question_answers').insert({ question_id: question.id, user_id: profile.id, answer: myAnswer.trim() })
    setSavedAnswer(myAnswer.trim()); setMyAnswer(''); loadAll()
  }

  if (!profile) return null
  const timeDiff = partnerProfile ? getTimeDiff(profile.timezone, partnerProfile.timezone) : null

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 animate-fade-in">

      {/* ════════ SECTION 1: Greeting + Clocks ════════ */}
      <section className="text-center mb-8 pt-4">
        <p className="text-[11px] tracking-[0.25em] uppercase text-text-dim/70 mb-4">{getGreeting()}</p>
        <h1 className="text-3xl md:text-[2.5rem] font-light tracking-tight mb-7 gradient-text leading-tight">
          {profile.display_name}
          {partnerProfile && <span className="text-text-dim/40 mx-2 font-extralight">&</span>}
          {partnerProfile?.display_name}
        </h1>

        {/* Inline clocks */}
        <div className="flex items-center justify-center gap-8 text-sm">
          <div className="text-center">
            <p className="text-2xl font-light tabular-nums tracking-tight">{time1}</p>
            <p className="text-[10px] text-text-dim mt-1 flex items-center justify-center gap-1">
              <MapPin size={9} />
              {profile.location_city || profile.timezone.split('/').pop()?.replace('_', ' ')}
            </p>
          </div>
          {partnerProfile && (
            <>
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 h-px bg-gradient-to-r from-transparent via-text-dim/30 to-transparent" />
                {timeDiff && <span className="text-[9px] text-text-dim">{timeDiff}</span>}
              </div>
              <div className="text-center">
                <p className="text-2xl font-light tabular-nums tracking-tight">{time2}</p>
                <p className="text-[10px] text-text-dim mt-1 flex items-center justify-center gap-1">
                  <MapPin size={9} />
                  {partnerProfile.location_city || partnerProfile.timezone.split('/').pop()?.replace('_', ' ')}
                </p>
              </div>
            </>
          )}
        </div>

        {!partnerProfile && (
          <p className="text-xs text-text-dim mt-4 max-w-[260px] mx-auto leading-relaxed">
            Invite ton/ta partenaire depuis les Réglages
          </p>
        )}
      </section>

      {/* ════════ Love Note ════════ */}
      <LoveNoteWidget />

      {/* ════════ SECTION 2: Heart — THE centerpiece ════════ */}
      <section className="text-center py-16 mb-2 relative">
        {/* Background ambient glow — always alive */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 rounded-full bg-primary/[0.04] blur-[80px] animate-glow-breath" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-40 h-40 rounded-full bg-secondary/[0.06] blur-[60px] animate-glow-breath" style={{ animationDelay: '2s' }} />
        </div>

        <div className="relative inline-flex items-center justify-center mb-8">
          {/* Outer breathing ring */}
          <div className={`absolute w-36 h-36 rounded-full transition-all duration-1000 ${
            tapped
              ? 'bg-secondary/20 scale-125 blur-xl'
              : receivedTap
                ? 'bg-secondary/12 scale-115 blur-lg'
                : 'border border-primary/[0.08] animate-heart-breath'
          }`} />

          {/* Inner glow ring */}
          <div className={`absolute w-28 h-28 rounded-full transition-all duration-700 ${
            tapped
              ? 'bg-secondary/15 scale-110'
              : receivedTap
                ? 'bg-secondary/10 scale-105'
                : 'bg-primary/[0.03]'
          }`} />

          <button
            onClick={sendTap}
            disabled={tapped || !partnerProfile}
            className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ease-out ${
              tapped ? 'scale-115' : receivedTap ? 'scale-108' : 'hover:scale-105 active:scale-90'
            }`}
          >
            <Heart
              size={46}
              strokeWidth={1.2}
              className={`transition-all duration-700 ease-out ${
                tapped
                  ? 'text-secondary fill-secondary drop-shadow-[0_0_20px_rgba(194,120,142,0.5)]'
                  : receivedTap
                    ? 'text-secondary/90 fill-secondary/90 drop-shadow-[0_0_15px_rgba(194,120,142,0.3)]'
                    : 'text-primary/40 fill-primary/10 hover:text-primary/70 hover:fill-primary/20'
              }`}
            />
          </button>
        </div>

        {/* Status text */}
        <p className="text-[15px] font-light tracking-wide mb-2">
          {tapped ? (
            <span className="text-secondary/90 animate-fade-in">Envoyé avec amour</span>
          ) : receivedTap ? (
            <span className="text-secondary/80 animate-fade-in">{partnerProfile?.display_name} pense à toi</span>
          ) : (
            <span className="text-text-muted/70">Je pense à toi</span>
          )}
        </p>

        {/* Streak + Stats — subtle, below */}
        <div className="flex items-center justify-center gap-4 text-[11px] text-text-dim/80">
          {streak > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="text-accent/80">🔥</span>
              <span className="tabular-nums">{streak} jour{streak > 1 ? 's' : ''}</span>
            </span>
          )}
          {todayCount > 0 && <span>{todayCount} envoyé{todayCount > 1 ? 's' : ''}</span>}
          {partnerTodayCount > 0 && <span>{partnerTodayCount} reçu{partnerTodayCount > 1 ? 's' : ''}</span>}
        </div>

        {/* Days together — the quiet anchor */}
        {daysTogether > 0 && (
          <p className="text-[10px] text-text-dim/40 mt-5 tracking-[0.15em] uppercase">
            Jour {daysTogether}
          </p>
        )}
      </section>

      {/* ════════ SECTION 3: Countdown banner ════════ */}
      {countdown && (
        <section className="text-center py-8 mb-2 border-t border-b border-white/[0.04]">
          <p className="text-[10px] tracking-[0.2em] uppercase text-text-dim mb-1">
            <Timer size={10} className="inline mr-1 -mt-px" />
            Prochaines retrouvailles
          </p>
          <p className="text-sm text-text-muted mb-4">{countdown.emoji} {countdown.title}</p>

          {remaining.passed ? (
            <p className="text-xl font-light text-accent">C'est aujourd'hui !</p>
          ) : (
            <div className="flex items-baseline justify-center gap-6">
              {[
                { v: remaining.days, l: 'jours' },
                { v: remaining.hours, l: 'heures' },
                { v: remaining.minutes, l: 'min' },
              ].map(({ v, l }) => (
                <div key={l} className="text-center">
                  <p className="text-4xl font-extralight tabular-nums tracking-tight">{v}</p>
                  <p className="text-[9px] tracking-[0.15em] uppercase text-text-dim mt-1">{l}</p>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-text-dim/60 mt-4">
            {format(new Date(countdown.target_date), "EEEE d MMMM", { locale: fr })}
          </p>
        </section>
      )}

      {/* ════════ SECTION 4: Mood — simple row ════════ */}
      <section className="py-6 mb-2">
        {showMoodPicker ? (
          <div className="text-center animate-fade-in">
            <p className="text-sm text-text-muted mb-4">Comment te sens-tu ?</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xs mx-auto">
              {MOODS.map(({ emoji, label }) => (
                <button
                  key={emoji}
                  onClick={() => selectMood(emoji, label)}
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-xl hover:bg-white/[0.05] active:scale-90 transition-all"
                  title={label}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {myMood && (
              <button onClick={() => setShowMoodPicker(false)} className="text-xs text-text-dim mt-3 hover:text-text-muted">
                Annuler
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-6">
            {/* My mood */}
            <button
              onClick={() => setShowMoodPicker(true)}
              className="flex items-center gap-2 hover:bg-white/[0.03] px-3 py-2 rounded-xl transition-all group"
            >
              {myMood ? (
                <span className="text-2xl">{myMood.emoji}</span>
              ) : (
                <span className="w-8 h-8 rounded-full border border-dashed border-white/[0.1] flex items-center justify-center text-text-dim text-xs">?</span>
              )}
              <div className="text-left">
                <p className="text-xs text-text-muted">{profile.display_name}</p>
                <p className="text-[10px] text-text-dim">{myMood ? myMood.label : 'Définir'}</p>
              </div>
            </button>

            {partnerProfile && (
              <>
                <div className="w-px h-6 bg-white/[0.06]" />
                <div className="flex items-center gap-2 px-3 py-2">
                  {partnerMood ? (
                    <span className="text-2xl">{partnerMood.emoji}</span>
                  ) : (
                    <span className="w-8 h-8 rounded-full border border-dashed border-white/[0.06] flex items-center justify-center">
                      <Heart size={12} className="text-text-dim/40" />
                    </span>
                  )}
                  <div className="text-left">
                    <p className="text-xs text-text-muted">{partnerProfile.display_name}</p>
                    <p className="text-[10px] text-text-dim">{partnerMood ? partnerMood.label : 'En attente...'}</p>
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
            <p className="text-[10px] tracking-[0.2em] uppercase text-text-dim mb-4">
              <MessageCircle size={10} className="inline mr-1 -mt-px" />
              Question du jour
            </p>
            <p className="text-lg md:text-xl font-light italic leading-relaxed max-w-md mx-auto">
              {question.question}
            </p>
          </div>

          {savedAnswer ? (
            <div className="max-w-md mx-auto space-y-3">
              <div className="rounded-xl p-4 bg-white/[0.03]">
                <p className="text-[10px] text-primary uppercase tracking-wider mb-1.5">Toi</p>
                <p className="text-sm leading-relaxed text-text/80">{savedAnswer}</p>
              </div>
              {partnerAnswer ? (
                <div className="rounded-xl p-4 bg-white/[0.03] animate-fade-in">
                  <p className="text-[10px] text-secondary uppercase tracking-wider mb-1.5">{partnerProfile?.display_name}</p>
                  <p className="text-sm leading-relaxed text-text/80">{partnerAnswer}</p>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-text-dim text-xs py-3">
                  <Lock size={12} />
                  <span>En attente de {partnerProfile?.display_name ?? 'ton/ta partenaire'}</span>
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
                placeholder="Ta réponse..."
                className="input flex-1"
              />
              <button onClick={submitAnswer} disabled={!myAnswer.trim()} className="btn btn-primary px-4">
                <Send size={16} />
              </button>
            </div>
          )}
        </section>
      )}

      {/* ════════ SECTION 6: Gratitude ════════ */}
      <div className="border-t border-white/[0.04] pt-6">
        <GratitudeWidget />
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Timer, Plus, X, Sparkles, Trash2 } from 'lucide-react'
import { differenceInDays, differenceInHours, differenceInMinutes, isPast, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Countdown } from '@/types/database'

function getTimeRemaining(targetDate: string) {
  const target = new Date(targetDate)
  if (isPast(target)) return { days: 0, hours: 0, minutes: 0, passed: true }

  const now = new Date()
  const days = differenceInDays(target, now)
  const hours = differenceInHours(target, now) % 24
  const minutes = differenceInMinutes(target, now) % 60

  return { days, hours, minutes, passed: false }
}

export default function CountdownWidget() {
  const { profile } = useAuthStore()
  const [countdowns, setCountdowns] = useState<Countdown[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!profile) return
    loadCountdowns()
    const interval = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(interval)
  }, [profile])

  const loadCountdowns = async () => {
    const { data } = await supabase
      .from('countdowns')
      .select('*')
      .eq('is_active', true)
      .order('target_date', { ascending: true })
    if (data) setCountdowns(data)
  }

  const addCountdown = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return

    await supabase.from('countdowns').insert({
      created_by: profile.id,
      title,
      target_date: new Date(date).toISOString(),
    })
    setTitle('')
    setDate('')
    setShowForm(false)
    loadCountdowns()
  }

  const deleteCountdown = async (id: string) => {
    await supabase.from('countdowns').update({ is_active: false }).eq('id', id)
    loadCountdowns()
  }

  const mainCountdown = countdowns[0]
  const remaining = mainCountdown ? getTimeRemaining(mainCountdown.target_date) : null

  return (
    <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] transition-all duration-500 ease-out hover:bg-[#252118] hover:shadow-[0_8px_48px_rgba(0,0,0,0.3),0_0_0_1px_rgba(212,165,116,0.04)] group">
      {/* Top edge glow */}
      <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 group-hover:via-[rgba(212,165,116,0.2)] transition-opacity duration-500 ease-out" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[rgba(194,120,142,0.12)] flex items-center justify-center">
            <Timer size={15} className="text-[#C2788E]" />
          </div>
          <h3 className="text-sm font-medium tracking-wide uppercase text-[#9B9287]">Retrouvailles</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9B9287] hover:text-[#D4A574] hover:bg-[rgba(212,165,116,0.06)] transition-all duration-300 ease-out"
        >
          {showForm ? <X size={15} /> : <Plus size={15} />}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addCountdown} className="mb-4 space-y-2.5 p-3 rounded-xl bg-[rgba(255,255,255,0.03)] animate-slide-up">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (ex: Week-end Paris)"
            className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
            required
          />
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)] flex-1"
              required
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out"
            >
              Ajouter
            </button>
          </div>
        </form>
      )}

      {mainCountdown && remaining ? (
        <div className="text-center py-2">
          <p className="text-sm leading-relaxed text-[#F0EAE0]/80 mb-5 font-medium">
            {mainCountdown.emoji} {mainCountdown.title}
          </p>
          {remaining.passed ? (
            <div className="animate-bounce-in">
              <Sparkles className="inline text-[#E8B86D] mb-2" size={24} />
              <p className="text-[#D4A574] text-xl font-light tracking-tight">C'est aujourd'hui !</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center gap-3">
                {[
                  { value: remaining.days, label: 'jours' },
                  { value: remaining.hours, label: 'heures' },
                  { value: remaining.minutes, label: 'min' },
                ].map(({ value, label }) => (
                  <div key={label} className="min-w-[4.5rem] p-3 rounded-xl bg-[rgba(255,255,255,0.03)] relative overflow-hidden">
                    {/* Subtle inner glow for each countdown cell */}
                    <div className="absolute inset-0 bg-gradient-to-b from-[rgba(194,120,142,0.04)] to-transparent pointer-events-none" />
                    <p
                      className="text-4xl font-light tabular-nums tracking-tight relative"
                      style={{
                        background: remaining.days <= 3
                          ? 'linear-gradient(180deg, #D99AAD, #C2788E)'
                          : remaining.days <= 7
                          ? 'linear-gradient(180deg, #E8C9A0, #E8B86D)'
                          : 'linear-gradient(180deg, #E8C9A0, #D4A574)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        textShadow: '0 0 30px rgba(212,165,116,0.15)',
                      }}
                    >
                      {value}
                    </p>
                    <p className="text-[10px] text-[#6B6359] mt-1 uppercase tracking-wider font-medium relative">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] tracking-wide text-[#6B6359] mt-4">
                {format(new Date(mainCountdown.target_date), "EEEE d MMMM yyyy 'a' HH'h'mm", { locale: fr })}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="text-center py-6">
          <Timer size={28} className="mx-auto text-[#6B6359] mb-2 opacity-40" />
          <p className="text-[#9B9287] text-sm leading-relaxed">Aucun compte a rebours</p>
          <p className="text-[#6B6359] text-[11px] tracking-wide mt-1">Ajoutes-en un avec le + ci-dessus</p>
        </div>
      )}

      {countdowns.length > 1 && (
        <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-2">
          {countdowns.slice(1).map((c) => {
            const r = getTimeRemaining(c.target_date)
            return (
              <div key={c.id} className="flex justify-between items-center text-sm group/item">
                <span className="text-[#F0EAE0]/80 leading-relaxed">{c.emoji} {c.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#9B9287] text-[11px] tracking-wide">
                    {r.passed ? 'Passe' : `${r.days}j ${r.hours}h`}
                  </span>
                  <button
                    onClick={() => deleteCountdown(c.id)}
                    className="opacity-0 group-hover/item:opacity-100 text-[#6B6359] hover:text-[#C2788E] transition-all duration-300 p-0.5"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

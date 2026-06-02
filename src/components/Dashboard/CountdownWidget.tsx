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

function getUrgencyColor(days: number): string {
  if (days <= 3) return 'text-secondary'
  if (days <= 7) return 'text-accent'
  return 'gradient-text'
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
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
            <Timer size={15} className="text-secondary" />
          </div>
          <h3 className="text-sm font-semibold">Prochaines retrouvailles</h3>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-all">
          {showForm ? <X size={15} /> : <Plus size={15} />}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addCountdown} className="mb-4 space-y-2.5 p-3 rounded-xl bg-surface-lighter/30 animate-slide-up">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (ex: Week-end Paris)"
            className="input text-sm"
            required
          />
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input flex-1 text-sm"
              required
            />
            <button type="submit" className="btn btn-primary text-xs px-4">Ajouter</button>
          </div>
        </form>
      )}

      {mainCountdown && remaining ? (
        <div className="text-center py-2">
          <p className="text-base mb-4 font-medium">
            {mainCountdown.emoji} {mainCountdown.title}
          </p>
          {remaining.passed ? (
            <div className="animate-bounce-in">
              <Sparkles className="inline text-accent mb-2" size={24} />
              <p className="text-success text-xl font-bold">C'est aujourd'hui ! 🎉</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center gap-3">
                {[
                  { value: remaining.days, label: 'jours' },
                  { value: remaining.hours, label: 'heures' },
                  { value: remaining.minutes, label: 'min' },
                ].map(({ value, label }) => (
                  <div key={label} className="min-w-[4.5rem] p-3 rounded-xl bg-white/[0.04]">
                    <p className={`text-3xl font-extrabold tabular-nums ${getUrgencyColor(remaining.days)}`}>
                      {value}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5 uppercase tracking-wider font-medium">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-text-dim mt-3">
                {format(new Date(mainCountdown.target_date), "EEEE d MMMM yyyy 'à' HH'h'mm", { locale: fr })}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="text-center py-6">
          <Timer size={28} className="mx-auto text-text-dim mb-2 opacity-40" />
          <p className="text-text-muted text-sm">Aucun compte à rebours</p>
          <p className="text-text-dim text-xs mt-1">Ajoutes-en un avec le + ci-dessus</p>
        </div>
      )}

      {countdowns.length > 1 && (
        <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-2">
          {countdowns.slice(1).map((c) => {
            const r = getTimeRemaining(c.target_date)
            return (
              <div key={c.id} className="flex justify-between items-center text-sm group">
                <span className="text-text/80">{c.emoji} {c.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-xs">
                    {r.passed ? '✨ Passé' : `${r.days}j ${r.hours}h`}
                  </span>
                  <button
                    onClick={() => deleteCountdown(c.id)}
                    className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-danger transition-all p-0.5"
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

import { useState, useEffect } from 'react'
import { Timer, Plus, X } from 'lucide-react'
import { differenceInDays, differenceInHours, differenceInMinutes, isPast } from 'date-fns'
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

  const mainCountdown = countdowns[0]
  const remaining = mainCountdown ? getTimeRemaining(mainCountdown.target_date) : null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Timer size={16} className="text-secondary" />
          <h3 className="text-sm font-semibold">Prochaines retrouvailles</h3>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="text-text-muted hover:text-primary transition-colors">
          {showForm ? <X size={16} /> : <Plus size={16} />}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addCountdown} className="mb-4 space-y-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (ex: Week-end Paris)"
            className="w-full bg-surface-lighter rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            required
          />
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 bg-surface-lighter rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
            <button type="submit" className="btn btn-primary text-xs px-3">Ajouter</button>
          </div>
        </form>
      )}

      {mainCountdown && remaining ? (
        <div className="text-center py-2">
          <p className="text-lg mb-3">{mainCountdown.emoji} {mainCountdown.title}</p>
          {remaining.passed ? (
            <p className="text-success text-lg font-bold">C'est aujourd'hui !</p>
          ) : (
            <div className="flex justify-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold gradient-text">{remaining.days}</p>
                <p className="text-xs text-text-muted">jours</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold gradient-text">{remaining.hours}</p>
                <p className="text-xs text-text-muted">heures</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold gradient-text">{remaining.minutes}</p>
                <p className="text-xs text-text-muted">min</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-center text-text-muted text-sm py-4">
          Aucun compte à rebours. Ajoutes-en un !
        </p>
      )}

      {countdowns.length > 1 && (
        <div className="mt-3 pt-3 border-t border-surface-lighter space-y-2">
          {countdowns.slice(1).map((c) => {
            const r = getTimeRemaining(c.target_date)
            return (
              <div key={c.id} className="flex justify-between items-center text-sm">
                <span>{c.emoji} {c.title}</span>
                <span className="text-text-muted">
                  {r.passed ? 'Passé' : `${r.days}j ${r.hours}h`}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

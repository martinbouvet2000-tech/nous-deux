import { useState } from 'react'
import { Settings, LogOut, User, MapPin, Link2, Copy, Check, Share2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'

const TIMEZONES = [
  'Europe/Paris',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
]

export default function SettingsPage() {
  const { profile, partnerProfile, signOut, fetchProfile, linkPartner } = useAuthStore()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [timezone, setTimezone] = useState(profile?.timezone ?? 'Europe/Paris')
  const [city, setCity] = useState(profile?.location_city ?? '')
  const [partnerCode, setPartnerCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [linking, setLinking] = useState(false)
  const [copied, setCopied] = useState(false)

  const saveProfile = async () => {
    if (!profile) return
    setSaving(true)

    await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        timezone,
        location_city: city || null,
      })
      .eq('id', profile.id)

    await fetchProfile()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleLinkPartner = async () => {
    if (!partnerCode.trim()) return
    setLinkError('')
    setLinking(true)
    try {
      await linkPartner(partnerCode)
    } catch (err: any) {
      setLinkError(err.message)
    } finally {
      setLinking(false)
    }
  }

  const copyCode = async () => {
    if (!profile?.partner_code) return
    await navigator.clipboard.writeText(profile.partner_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareCode = async () => {
    if (!profile?.partner_code) return
    const text = `Rejoins-moi sur Nous Deux ! Mon code d'invitation : ${profile.partner_code}`
    if (navigator.share) {
      await navigator.share({ title: 'Nous Deux', text })
    } else {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-5">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Settings size={20} className="text-primary" />
        Réglages
      </h2>

      {!partnerProfile && (
        <div className="card space-y-4 border-primary/30 bg-gradient-to-br from-primary/5 to-secondary/5">
          <h3 className="font-semibold flex items-center gap-2">
            <Link2 size={16} className="text-primary" />
            Inviter ton/ta partenaire
          </h3>

          <div>
            <label className="block text-xs text-text-muted mb-2">Ton code d'invitation</label>
            <div className="flex gap-2">
              <div className="flex-1 bg-surface-lighter rounded-xl px-4 py-3 font-mono text-lg tracking-widest text-center select-all">
                {profile?.partner_code ?? '...'}
              </div>
              <button
                onClick={copyCode}
                className="btn btn-ghost px-3"
                title="Copier"
              >
                {copied ? <Check size={18} className="text-success" /> : <Copy size={18} />}
              </button>
              <button
                onClick={shareCode}
                className="btn btn-primary px-3"
                title="Partager"
              >
                <Share2 size={18} />
              </button>
            </div>
            <p className="text-xs text-text-muted mt-2">
              Envoie ce code à ton/ta partenaire. Il/elle doit créer un compte puis entrer ce code.
            </p>
          </div>

          <div className="border-t border-surface-lighter pt-4">
            <label className="block text-xs text-text-muted mb-2">Code de ton/ta partenaire</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
                className="input font-mono tracking-widest text-center text-lg uppercase"
                placeholder="XXXXXXXX"
                maxLength={8}
              />
              <button
                onClick={handleLinkPartner}
                disabled={linking || partnerCode.trim().length < 4}
                className="btn btn-primary px-5 shrink-0"
              >
                {linking ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  'Lier'
                )}
              </button>
            </div>
            {linkError && (
              <p className="text-danger text-xs mt-2 animate-bounce-in">{linkError}</p>
            )}
          </div>
        </div>
      )}

      {partnerProfile && (
        <div className="card bg-gradient-to-br from-primary/5 to-secondary/5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Link2 size={14} className="text-success" />
            Partenaire lie
          </h3>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center text-xl">
              {partnerProfile.avatar_url ? (
                <img src={partnerProfile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                '💕'
              )}
            </div>
            <div>
              <p className="font-semibold">{partnerProfile.display_name}</p>
              <p className="text-xs text-text-muted">{partnerProfile.location_city ?? partnerProfile.timezone}</p>
            </div>
          </div>
        </div>
      )}

      <div className="card space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <User size={16} /> Mon profil
        </h3>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">Prénom</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">Fuseau horaire</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="input"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5 flex items-center gap-1">
            <MapPin size={12} /> Ville
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="input"
            placeholder="Ex: Paris"
          />
        </div>

        <button onClick={saveProfile} disabled={saving} className="btn btn-primary w-full py-3">
          {saving ? (
            <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : saved ? (
            <span className="flex items-center gap-2"><Check size={16} /> Sauvegarde !</span>
          ) : (
            'Sauvegarder'
          )}
        </button>
      </div>

      <button onClick={signOut} className="btn btn-ghost w-full text-danger py-3">
        <LogOut size={16} />
        Se déconnecter
      </button>
    </div>
  )
}

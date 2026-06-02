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
    <div className="px-5 md:px-8 py-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <h2 className="text-lg font-light tracking-tight flex items-center gap-2.5 text-[#F0EAE0]">
        <div className="w-8 h-8 rounded-xl bg-[rgba(212,165,116,0.12)] flex items-center justify-center">
          <Settings size={16} className="text-[#D4A574]" />
        </div>
        Reglages
      </h2>

      {/* Partner invitation card */}
      {!partnerProfile && (
        <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] space-y-4">
          <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />
          {/* Subtle warm ambient glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(212,165,116,0.04)] to-[rgba(194,120,142,0.03)] pointer-events-none" />

          <h3 className="text-sm font-medium tracking-wide text-[#F0EAE0] flex items-center gap-2 relative">
            <Link2 size={16} className="text-[#D4A574]" />
            Inviter ton/ta partenaire
          </h3>

          <div className="relative">
            <label className="block text-[11px] tracking-wide text-[#6B6359] mb-2">Ton code d'invitation</label>
            <div className="flex gap-2">
              <div className="flex-1 bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 font-mono text-lg tracking-widest text-center text-[#F0EAE0] select-all">
                {profile?.partner_code ?? '...'}
              </div>
              <button
                onClick={copyCode}
                className="inline-flex items-center justify-center px-3 rounded-xl text-sm font-medium text-[#9B9287] bg-transparent hover:text-[#F0EAE0] hover:bg-[rgba(212,165,116,0.06)] active:scale-[0.98] transition-all duration-300 ease-out"
                title="Copier"
              >
                {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              </button>
              <button
                onClick={shareCode}
                className="inline-flex items-center justify-center px-3 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out"
                title="Partager"
              >
                <Share2 size={18} />
              </button>
            </div>
            <p className="text-[11px] tracking-wide text-[#6B6359] mt-2 leading-relaxed">
              Envoie ce code a ton/ta partenaire. Il/elle doit creer un compte puis entrer ce code.
            </p>
          </div>

          <div className="border-t border-white/[0.04] pt-4 relative">
            <label className="block text-[11px] tracking-wide text-[#6B6359] mb-2">Code de ton/ta partenaire</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
                className="flex-1 bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 font-mono tracking-widest text-center text-lg text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)] uppercase"
                placeholder="XXXXXXXX"
                maxLength={8}
              />
              <button
                onClick={handleLinkPartner}
                disabled={linking || partnerCode.trim().length < 4}
                className="inline-flex items-center justify-center px-5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {linking ? (
                  <div className="w-4 h-4 rounded-full border-2 border-[#110F0E]/30 border-t-[#110F0E] animate-spin" />
                ) : (
                  'Lier'
                )}
              </button>
            </div>
            {linkError && (
              <p className="text-red-400 text-[11px] tracking-wide mt-2">{linkError}</p>
            )}
          </div>
        </div>
      )}

      {/* Partner linked card */}
      {partnerProfile && (
        <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17]">
          <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(212,165,116,0.04)] to-[rgba(194,120,142,0.03)] pointer-events-none" />

          <h3 className="text-[11px] tracking-wide uppercase font-medium text-[#9B9287] mb-3 flex items-center gap-2 relative">
            <Link2 size={14} className="text-emerald-400" />
            Partenaire lie
          </h3>
          <div className="flex items-center gap-4 relative">
            <div className="w-12 h-12 rounded-full bg-[rgba(194,120,142,0.12)] flex items-center justify-center text-xl">
              {partnerProfile.avatar_url ? (
                <img src={partnerProfile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                '💕'
              )}
            </div>
            <div>
              <p className="font-medium text-sm text-[#F0EAE0]">{partnerProfile.display_name}</p>
              <p className="text-[11px] tracking-wide text-[#6B6359]">{partnerProfile.location_city ?? partnerProfile.timezone}</p>
            </div>
          </div>
        </div>
      )}

      {/* Profile card */}
      <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] space-y-4">
        <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />

        <h3 className="text-sm font-medium tracking-wide text-[#F0EAE0] flex items-center gap-2">
          <User size={16} className="text-[#9B9287]" /> Mon profil
        </h3>

        <div>
          <label className="block text-[11px] tracking-wide text-[#6B6359] mb-1.5">Prenom</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
          />
        </div>

        <div>
          <label className="block text-[11px] tracking-wide text-[#6B6359] mb-1.5">Fuseau horaire</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)] appearance-none"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz} className="bg-[#1E1B17] text-[#F0EAE0]">{tz}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] tracking-wide text-[#6B6359] mb-1.5 flex items-center gap-1">
            <MapPin size={12} /> Ville
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
            placeholder="Ex: Paris"
          />
        </div>

        <button
          onClick={saveProfile}
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <div className="w-4 h-4 rounded-full border-2 border-[#110F0E]/30 border-t-[#110F0E] animate-spin" />
          ) : saved ? (
            <span className="flex items-center gap-2"><Check size={16} /> Sauvegarde !</span>
          ) : (
            'Sauvegarder'
          )}
        </button>
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-red-400/70 bg-transparent hover:text-red-400 hover:bg-[rgba(239,68,68,0.06)] active:scale-[0.98] transition-all duration-300 ease-out"
      >
        <LogOut size={16} />
        Se deconnecter
      </button>
    </div>
  )
}

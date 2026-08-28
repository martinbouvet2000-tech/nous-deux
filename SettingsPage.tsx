import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Heart, LogOut, User, MapPin, Link2, Copy, Check, Share2, Unlink, Trash2, ShieldCheck, Download, Locate, KeyRound } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { confirm } from '@/lib/confirm'
import { getAllTimezones, detectTimezone, timezoneCity, timezoneRegion, timezoneLabel, zonedDateKey } from '@/lib/timezone'
import { describeDateInput } from '@/lib/dates'
import { SELECT, BTN_PRIMARY, BTN_GHOST, INPUT, LABEL, CARD, CARD_EDGE, ICON_BTN, CARD_TITLE } from '@/lib/ui'
import PageHeader from '@/components/ui/PageHeader'
import ShareLocationToggle from '@/components/map/ShareLocationToggle'
import InstallAppButton from '@/components/settings/InstallAppButton'
import NotificationsToggle from '@/components/settings/NotificationsToggle'
import BackgroundLocationTokens from '@/components/settings/BackgroundLocationTokens'

export default function SettingsPage() {
  const { profile, partnerProfile, user, signOut, fetchProfile, linkPartner, unlinkPartner, deleteAccount, requestPasswordReset } = useAuthStore()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [timezone, setTimezone] = useState(profile?.timezone ?? detectTimezone())
  const [city, setCity] = useState(profile?.location_city ?? '')
  const [relationshipStart, setRelationshipStart] = useState(profile?.relationship_start ?? '')
  const [partnerCode, setPartnerCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [linking, setLinking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const timezones = useMemo(() => getAllTimezones(), [])
  const detected = useMemo(() => detectTimezone(), [])
  // Le sélecteur ne montre jamais d’identifiant IANA : villes en français,
  // regroupées par région et triées avec les règles d’alphabet français.
  const timezoneGroups = useMemo(() => {
    const collator = new Intl.Collator('fr')
    const byRegion = new Map<string, { tz: string; city: string }[]>()
    for (const tz of timezones) {
      const region = timezoneRegion(tz)
      const list = byRegion.get(region) ?? []
      list.push({ tz, city: timezoneCity(tz) })
      byRegion.set(region, list)
    }
    return [...byRegion]
      .map(([region, cities]) => ({ region, cities: cities.sort((a, b) => collator.compare(a.city, b.city)) }))
      .sort((a, b) => collator.compare(a.region, b.region))
  }, [timezones])
  // « Aujourd’hui » se lit dans le fuseau du profil, pas dans celui du navigateur :
  // à 00 h 30 à Varsovie, l’UTC est encore la veille et bornerait le champ trop tôt.
  const todayKey = zonedDateKey(timezone, new Date())
  // Le sélecteur natif s’affiche au format du système (souvent mm/jj/aaaa) :
  // on relit la date choisie en toutes lettres, en français.
  const relationshipEcho = describeDateInput(relationshipStart)

  // Si le profil arrive après le montage
  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name)
    setTimezone(profile.timezone)
    setCity(profile.location_city ?? '')
    setRelationshipStart(profile.relationship_start ?? '')
  }, [profile])

  const dirty = !!profile && (
    displayName.trim() !== profile.display_name ||
    timezone !== profile.timezone ||
    (city.trim() || null) !== (profile.location_city ?? null) ||
    (relationshipStart || null) !== (profile.relationship_start ?? null)
  )

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    const name = displayName.trim()
    if (!name) return toast.error('Ton prénom ne peut pas être vide.')
    setSaving(true)
    const { ok } = await run(
      supabase.from('profiles').update({
        display_name: name,
        timezone,
        location_city: city.trim() || null,
        relationship_start: relationshipStart || null,
      }).eq('id', profile.id),
      { errorMessage: 'Le profil n’a pas pu être enregistré.' },
    )
    if (ok) {
      await fetchProfile()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  const handleLinkPartner = async () => {
    if (!partnerCode.trim()) return
    setLinkError('')
    setLinking(true)
    try {
      await linkPartner(partnerCode)
      toast.success('Vous êtes liés.')
      setPartnerCode('')
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Impossible de lier ce code.')
    } finally {
      setLinking(false)
    }
  }

  const copyCode = async () => {
    if (!profile?.partner_code) return
    try {
      await navigator.clipboard.writeText(profile.partner_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copie impossible — sélectionne le code manuellement.')
    }
  }

  const shareCode = async () => {
    if (!profile?.partner_code) return
    const text = `Rejoins-moi sur Awy\u202f! Mon code d’invitation\u202f: ${profile.partner_code}\n${window.location.origin}${import.meta.env.BASE_URL}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Awy', text })
      } else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch { /* partage annulé */ }
  }

  const handleUnlink = async () => {
    if (!partnerProfile) return
    const yes = await confirm({
      title: `Te délier de ${partnerProfile.display_name}\u202f?`,
      message: 'Vous serez déliés tous les deux\u202f: vous ne verrez plus les données l’un de l’autre. Rien n’est supprimé — vos codes restent valables, et tout réapparaîtra le jour où vous vous relierez.',
      confirmLabel: 'Me délier', danger: true, irreversible: false,
    })
    if (!yes) return
    setBusy(true)
    try {
      await unlinkPartner()
      toast.info('Vous êtes déliés. Vos codes restent valables.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de te délier.')
    } finally {
      setBusy(false)
    }
  }

  const handleChangePassword = async () => {
    if (!user?.email) return
    setBusy(true)
    try {
      await requestPasswordReset(user.email)
      toast.success(`Un lien pour changer ton mot de passe a été envoyé à ${user.email}.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible d’envoyer l’email.')
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async () => {
    if (!profile) return
    setBusy(true)
    try {
      const tables = ['love_notes', 'vlogs', 'availability', 'schedule_slots', 'locations', 'moods', 'gratitudes', 'taps', 'countdowns', 'calendar_events', 'capsules', 'todo_lists', 'todo_items', 'watch_items', 'bucket_items', 'question_answers'] as const
      const out: Record<string, unknown> = { exported_at: new Date().toISOString(), profile }
      for (const t of tables) {
        const { data } = await supabase.from(t).select('*')
        out[t] = data ?? []
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `awy-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export téléchargé.')
    } catch {
      toast.error('L’export a échoué.')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    const yes = await confirm({
      title: 'Supprimer définitivement ton compte\u202f?',
      message: 'Tout ce que tu as écrit et partagé ici (pensées, souvenirs, capsules…) sera effacé, et tu seras délié·e. Pense à exporter tes données avant.',
      confirmLabel: 'Supprimer mon compte', danger: true,
    })
    if (!yes) return
    const really = await confirm({ title: 'Dernière étape', message: 'Ton compte est supprimé dès que tu confirmes. Il n’y a pas de retour en arrière.', confirmLabel: 'Oui, supprimer', danger: true })
    if (!really) return
    setBusy(true)
    try {
      await deleteAccount()
      toast.info('Compte supprimé. Prends soin de toi.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Suppression impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-5 md:px-8 py-6 max-md:py-7 max-w-3xl lg:max-w-[1000px] mx-auto reveal">
      <PageHeader eyebrow="Ton espace" title="Réglages" subtitle="Ton profil, votre lien, ta sécurité et tes données." />
      <div className="grid gap-5 max-md:gap-6 lg:grid-cols-2 lg:items-start mt-4">
      <div className="space-y-5 max-md:space-y-6">

      {/* ─── Partenaire : invitation ─── */}
      {!partnerProfile && (
        <section className={`${CARD} space-y-4 max-md:space-y-5`} aria-labelledby="invite-title">
          <div className={CARD_EDGE} aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(212,165,116,0.04)] to-[rgba(194,120,142,0.03)] pointer-events-none" aria-hidden="true" />
          <h2 id="invite-title" className={`${CARD_TITLE} relative`}>
            <Link2 size={16} className="text-[#D4A574]" aria-hidden="true" />
            Inviter ton/ta partenaire
          </h2>

          <div className="relative">
            <p className={LABEL}>Ton code d’invitation</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 font-mono text-lg tracking-widest text-center text-[#F0EAE0] select-all" aria-label="Code d’invitation">
                {profile?.partner_code ?? '…'}
              </div>
              <button onClick={copyCode} className={ICON_BTN} aria-label="Copier le code" title="Copier">
                {copied ? <Check size={18} className="text-emerald-400" aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
              </button>
              <button onClick={shareCode} className={`${BTN_PRIMARY} px-3`} aria-label="Partager le code" title="Partager">
                <Share2 size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs tracking-wide text-[#9B9287] mt-2 leading-relaxed">
              Envoie ce code à ton/ta partenaire. Une fois son compte créé, il suffit de l’entrer ici, dans les Réglages.
            </p>
          </div>

          <div className="border-t border-white/[0.04] pt-4 relative">
            <label htmlFor="partner-code" className={LABEL}>Ou entre le code de ton/ta partenaire</label>
            <div className="flex gap-2">
              <input
                id="partner-code"
                type="text"
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleLinkPartner()}
                className={`${INPUT} flex-1 font-mono tracking-widest text-center text-lg uppercase`}
                placeholder="XXXXXXXX"
                maxLength={8}
                autoComplete="off"
                autoCapitalize="characters"
              />
              <button onClick={handleLinkPartner} disabled={linking || partnerCode.trim().length !== 8} className={`${BTN_PRIMARY} px-5 shrink-0`}>
                {linking ? <span className="w-4 h-4 rounded-full border-2 border-[#110F0E]/30 border-t-[#110F0E] animate-spin" aria-label="Liaison en cours" /> : 'Lier'}
              </button>
            </div>
            <div aria-live="polite">{linkError && <p role="alert" className="text-red-300 text-xs tracking-wide mt-2">{linkError}</p>}</div>
          </div>
        </section>
      )}

      {/* ─── Partenaire : lié ─── */}
      {partnerProfile && (
        <section className={CARD} aria-labelledby="partner-title">
          <div className={CARD_EDGE} aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(212,165,116,0.04)] to-[rgba(194,120,142,0.03)] pointer-events-none" aria-hidden="true" />
          <h2 id="partner-title" className={`${CARD_TITLE} mb-3 relative`}>
            <Link2 size={16} className="text-[#D4A574]" aria-hidden="true" />
            Partenaire lié·e
          </h2>
          <div className="flex items-center gap-4 relative">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#D4A574]/15 to-[#C2788E]/15 shadow-[inset_0_0_0_1px_rgba(212,165,116,0.22)] flex items-center justify-center" aria-hidden="true">
              {partnerProfile.avatar_url ? <img src={partnerProfile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : <Heart size={18} className="text-[#C2788E]" fill="currentColor" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-[#F0EAE0]">{partnerProfile.display_name}</p>
              <p className="text-xs tracking-wide text-[#9B9287]">{partnerProfile.location_city ?? timezoneCity(partnerProfile.timezone)}</p>
            </div>
            <button onClick={handleUnlink} disabled={busy} className={`${BTN_GHOST} text-xs`} aria-label={`Délier de ${partnerProfile.display_name}`}>
              <Unlink size={14} aria-hidden="true" /> Délier
            </button>
          </div>
        </section>
      )}

      {/* ─── Profil ─── */}
      <form onSubmit={saveProfile} className={`${CARD} space-y-4 max-md:space-y-5`} aria-labelledby="profile-title">
        <div className={CARD_EDGE} aria-hidden="true" />
        <h2 id="profile-title" className={CARD_TITLE}>
          <User size={16} className="text-[#D4A574]" aria-hidden="true" /> Mon profil
        </h2>

        <div>
          <label htmlFor="pf-name" className={LABEL}>Prénom</label>
          <input id="pf-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={INPUT} maxLength={40} required autoComplete="given-name" />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="pf-tz" className={LABEL}>Fuseau horaire</label>
            {detected !== timezone && (
              <button type="button" onClick={() => setTimezone(detected)} className="tap-44 text-xs text-[#D4A574] hover:text-[#E8C9A0] inline-flex items-center gap-1 mb-1.5">
                <Locate size={11} aria-hidden="true" /> Détecter ({timezoneCity(detected)})
              </button>
            )}
          </div>
          <select id="pf-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={`${INPUT} ${SELECT}`}>
            {!timezones.includes(timezone) && <option value={timezone}>{timezoneLabel(timezone)}</option>}
            {timezoneGroups.map(({ region, cities }) => (
              <optgroup key={region} label={region} className="bg-[#1E1B17] text-[#F0EAE0]">
                {cities.map(({ tz, city }) => (
                  <option key={tz} value={tz} className="bg-[#1E1B17] text-[#F0EAE0]">{city}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="pf-city" className={`${LABEL} flex items-center gap-1`}>
            <MapPin size={12} aria-hidden="true" /> Ville
          </label>
          <input id="pf-city" type="text" value={city} onChange={(e) => setCity(e.target.value)} className={INPUT} placeholder={'Ex\u202f: Paris'} maxLength={60} autoComplete="address-level2" />
        </div>

        <ShareLocationToggle />

        <div>
          <label htmlFor="pf-since" className={LABEL}>Ensemble depuis</label>
          <input id="pf-since" type="date" lang="fr-FR" value={relationshipStart} onChange={(e) => setRelationshipStart(e.target.value)} max={todayKey} className={INPUT} aria-describedby="pf-since-echo" />
          <p id="pf-since-echo" className="text-xs text-[#D4A574]/90 mt-1.5 min-h-4" aria-live="polite">
            {relationshipEcho && `Depuis le ${relationshipEcho}.`}
          </p>
          <p className="text-xs leading-relaxed text-[#9B9287] mt-1">Sert au compteur «&#8239;Jour N ensemble&#8239;» sur l’accueil.</p>
        </div>

        <button type="submit" disabled={saving || !dirty} className={`${BTN_PRIMARY} w-full py-3`}>
          {saving ? (
            <span className="w-4 h-4 rounded-full border-2 border-[#110F0E]/30 border-t-[#110F0E] animate-spin" aria-label="Enregistrement" />
          ) : saved ? (
            <span className="flex items-center gap-2"><Check size={16} aria-hidden="true" /> Enregistré</span>
          ) : 'Enregistrer'}
        </button>
      </form>
      </div>

      <div className="space-y-5 max-md:space-y-6">
      {/* ─── Compte & sécurité ─── */}
      <section className={`${CARD} space-y-3`} aria-labelledby="account-title">
        <div className={CARD_EDGE} aria-hidden="true" />
        <h2 id="account-title" className={CARD_TITLE}>
          <ShieldCheck size={16} className="text-[#D4A574]" aria-hidden="true" /> Compte & données
        </h2>
        <p className="text-xs leading-relaxed text-[#9B9287]">Connecté·e en tant que <span className="text-[#F0EAE0]/80">{user?.email}</span></p>
        <InstallAppButton />
        <NotificationsToggle />
        <ul className="divide-y divide-white/[0.06] -mx-1">
          {[
            { icon: KeyRound, label: 'Changer mon mot de passe', onClick: handleChangePassword },
            { icon: Download, label: 'Exporter mes données (fichier JSON)', onClick: handleExport },
            { icon: LogOut, label: 'Se déconnecter', onClick: signOut },
          ].map(({ icon: Icon, label, onClick }) => (
            <li key={label}>
              <button onClick={onClick} disabled={busy} className="w-full min-h-12 px-1 flex items-center gap-3 text-sm text-[#F0EAE0]/90 hover:text-[#F0EAE0] disabled:opacity-60 transition-colors group">
                <Icon size={16} className="text-[#D4A574]/85" aria-hidden="true" />
                <span className="flex-1 text-left">{label}</span>
                <span className="text-[#9B9287] group-hover:text-[#F0EAE0] transition-colors" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Position en arrière-plan ─── */}
      <BackgroundLocationTokens />

      {/* ─── Zone de danger ─── */}
      <section className="rounded-[20px] p-5 shadow-[inset_0_0_0_1px_rgba(224,108,117,0.22)] bg-[rgba(224,108,117,0.04)]" aria-labelledby="danger-title">
        <h2 id="danger-title" className="font-display text-[17px] text-[#F0A5AD] flex items-center gap-2"><Trash2 size={15} aria-hidden="true" /> Zone sensible</h2>
        <p className="text-[13px] text-[#9B9287] mt-1.5 leading-relaxed">Supprimer ton compte efface définitivement tes données. Exporte-les avant si tu veux les garder.</p>
        <button onClick={handleDelete} disabled={busy} className="mt-3 text-[13px] text-[#F0A5AD]/90 underline underline-offset-4 decoration-[#F0A5AD]/40 hover:decoration-[#F0A5AD] min-h-11 disabled:opacity-60">
          Supprimer définitivement mon compte
        </button>
      </section>

      </div>
      </div>
      <p className="text-center text-[11px] tracking-[0.18em] uppercase text-[#9B9287] pt-8 pb-4">Awy · v{__APP_VERSION__}</p>
    </div>
  )
}


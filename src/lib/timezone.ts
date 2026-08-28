/** Liste complète des fuseaux IANA (avec repli si le navigateur ne la fournit pas) */
const FALLBACK_TIMEZONES = [
  'Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Warsaw',
  'Europe/Lisbon', 'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Athens',
  'Europe/Istanbul', 'Europe/Moscow', 'Africa/Casablanca', 'Africa/Dakar', 'Africa/Abidjan', 'Africa/Lagos',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Nairobi', 'Indian/Reunion', 'Indian/Mauritius',
  'America/New_York', 'America/Toronto', 'America/Montreal', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Vancouver', 'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Sao_Paulo', 'America/Buenos_Aires',
  'America/Santiago', 'America/Guadeloupe', 'America/Martinique', 'America/Cayenne', 'Asia/Dubai', 'Asia/Tehran',
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Jakarta',
  'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei', 'Asia/Seoul',
  'Asia/Tokyo', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane',
  'Pacific/Auckland', 'Pacific/Noumea', 'Pacific/Tahiti', 'Pacific/Honolulu', 'UTC',
]

export function getAllTimezones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    const list = intl.supportedValuesOf?.('timeZone')
    if (list && list.length > 50) return list
  } catch { /* ignore */ }
  return FALLBACK_TIMEZONES
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'
  } catch {
    return 'Europe/Paris'
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Décalage (en minutes) d’un fuseau par rapport à UTC à un instant donné — fiable, sans hack de parsing */
export function utcOffsetMinutes(tz: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUTC - at.getTime()) / 60000)
}

/**
 * Différence lisible entre deux fuseaux : "+5h30", "-6h", ou null si identiques.
 * Gère les décalages de 30/45 min (Inde, Népal, Adélaïde…).
 */
export function timezoneDiffLabel(fromTz: string, toTz: string, at: Date = new Date()): string | null {
  if (!isValidTimezone(fromTz) || !isValidTimezone(toTz)) return null
  const diff = utcOffsetMinutes(toTz, at) - utcOffsetMinutes(fromTz, at)
  if (diff === 0) return null
  const sign = diff > 0 ? '+' : '-'
  const abs = Math.abs(diff)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${h}h${m ? String(m).padStart(2, '0') : ''}`
}

/**
 * Villes dont le nom français diffère de l’identifiant IANA (cohérence FR de l’app).
 * Les identifiants historiques (Asia/Calcutta, Atlantic/Faeroe…) sont mappés en même
 * temps que les identifiants canoniques : selon le navigateur, l’un ou l’autre remonte.
 * Toute ville absente d’ici s’écrit pareil en français (Paris, Berlin, Tokyo…).
 */
const CITY_FR: Record<string, string> = {
  // Europe
  'Europe/Andorra': 'Andorre',
  'Europe/Athens': 'Athènes',
  'Europe/Brussels': 'Bruxelles',
  'Europe/Bucharest': 'Bucarest',
  'Europe/Busingen': 'Büsingen',
  'Europe/Copenhagen': 'Copenhague',
  'Europe/Guernsey': 'Guernesey',
  'Europe/Isle_of_Man': 'Île de Man',
  'Europe/Kiev': 'Kiev',
  'Europe/Kyiv': 'Kiev',
  'Europe/Lisbon': 'Lisbonne',
  'Europe/London': 'Londres',
  'Europe/Malta': 'Malte',
  'Europe/Moscow': 'Moscou',
  'Europe/Rome': 'Rome',
  'Europe/San_Marino': 'Saint-Marin',
  'Europe/Tirane': 'Tirana',
  'Europe/Uzhgorod': 'Oujhorod',
  'Europe/Vienna': 'Vienne',
  'Europe/Warsaw': 'Varsovie',
  'Europe/Zaporozhye': 'Zaporijjia',
  // Afrique
  'Africa/Addis_Ababa': 'Addis-Abeba',
  'Africa/Algiers': 'Alger',
  'Africa/Cairo': 'Le Caire',
  'Africa/El_Aaiun': 'Laâyoune',
  'Africa/Lome': 'Lomé',
  'Africa/Mogadishu': 'Mogadiscio',
  'Africa/Ndjamena': 'N’Djamena',
  'Africa/Sao_Tome': 'São Tomé',
  // Amériques
  'America/Asuncion': 'Asunción',
  'America/Bogota': 'Bogotá',
  'America/Cayman': 'Îles Caïmans',
  'America/Curacao': 'Curaçao',
  'America/Dominica': 'Dominique',
  'America/El_Salvador': 'Salvador',
  'America/Godthab': 'Nuuk',
  'America/Grenada': 'Grenade',
  'America/Barbados': 'Barbade',
  'America/Havana': 'La Havane',
  'America/Jamaica': 'Jamaïque',
  'America/Mexico_City': 'Mexico',
  'America/Miquelon': 'Saint-Pierre-et-Miquelon',
  'America/Montreal': 'Montréal',
  'America/New_York': 'New York',
  'America/Port_of_Spain': 'Port-d’Espagne',
  'America/Puerto_Rico': 'Porto Rico',
  'America/Santo_Domingo': 'Saint-Domingue',
  'America/Sao_Paulo': 'São Paulo',
  'America/St_Barthelemy': 'Saint-Barthélemy',
  'America/St_Johns': 'Saint-Jean (Terre-Neuve)',
  'America/St_Kitts': 'Saint-Kitts',
  'America/St_Lucia': 'Sainte-Lucie',
  'America/St_Thomas': 'Saint-Thomas',
  'America/St_Vincent': 'Saint-Vincent',
  'America/Thule': 'Thulé',
  // Asie & Moyen-Orient
  'Asia/Ashgabat': 'Achgabat',
  'Asia/Baghdad': 'Bagdad',
  'Asia/Bahrain': 'Bahreïn',
  'Asia/Baku': 'Bakou',
  'Asia/Beirut': 'Beyrouth',
  'Asia/Bishkek': 'Bichkek',
  'Asia/Calcutta': 'Calcutta',
  'Asia/Damascus': 'Damas',
  'Asia/Dhaka': 'Dacca',
  'Asia/Dubai': 'Dubaï',
  'Asia/Dushanbe': 'Douchanbé',
  'Asia/Famagusta': 'Famagouste',
  'Asia/Ho_Chi_Minh': 'Hô Chi Minh-Ville',
  'Asia/Irkutsk': 'Irkoutsk',
  'Asia/Jerusalem': 'Jérusalem',
  'Asia/Kabul': 'Kaboul',
  'Asia/Kamchatka': 'Kamtchatka',
  'Asia/Kathmandu': 'Katmandou',
  'Asia/Katmandu': 'Katmandou',
  'Asia/Kolkata': 'Calcutta',
  'Asia/Krasnoyarsk': 'Krasnoïarsk',
  'Asia/Kuwait': 'Koweït',
  'Asia/Macau': 'Macao',
  'Asia/Manila': 'Manille',
  'Asia/Muscat': 'Mascate',
  'Asia/Nicosia': 'Nicosie',
  'Asia/Novosibirsk': 'Novossibirsk',
  'Asia/Pyongyang': 'Pyongyang',
  'Asia/Rangoon': 'Rangoun',
  'Asia/Riyadh': 'Riyad',
  'Asia/Saigon': 'Hô Chi Minh-Ville',
  'Asia/Sakhalin': 'Sakhaline',
  'Asia/Samarkand': 'Samarcande',
  'Asia/Seoul': 'Séoul',
  'Asia/Singapore': 'Singapour',
  'Asia/Tashkent': 'Tachkent',
  'Asia/Tbilisi': 'Tbilissi',
  'Asia/Tehran': 'Téhéran',
  'Asia/Ulaanbaatar': 'Oulan-Bator',
  'Asia/Urumqi': 'Ürümqi',
  'Asia/Yakutsk': 'Iakoutsk',
  'Asia/Yangon': 'Rangoun',
  'Asia/Yekaterinburg': 'Iekaterinbourg',
  'Asia/Yerevan': 'Erevan',
  // Atlantique
  'Atlantic/Azores': 'Açores',
  'Atlantic/Bermuda': 'Bermudes',
  'Atlantic/Canary': 'Canaries',
  'Atlantic/Cape_Verde': 'Cap-Vert',
  'Atlantic/Faeroe': 'Féroé',
  'Atlantic/Faroe': 'Féroé',
  'Atlantic/Madeira': 'Madère',
  'Atlantic/South_Georgia': 'Géorgie du Sud',
  'Atlantic/St_Helena': 'Sainte-Hélène',
  // Océan Indien
  'Indian/Christmas': 'Île Christmas',
  'Indian/Comoro': 'Comores',
  'Indian/Mahe': 'Mahé',
  'Indian/Mauritius': 'Maurice',
  'Indian/Reunion': 'La Réunion',
  // Pacifique
  'Pacific/Chuuk': 'Chuuk',
  'Pacific/Easter': 'Île de Pâques',
  'Pacific/Enderbury': 'Kanton',
  'Pacific/Fiji': 'Fidji',
  'Pacific/Galapagos': 'Galápagos',
  'Pacific/Marquesas': 'Marquises',
  'Pacific/Noumea': 'Nouméa',
  'Pacific/Ponape': 'Pohnpei',
  'Pacific/Truk': 'Chuuk',
  // Antarctique
  'Antarctica/DumontDUrville': 'Dumont d’Urville',
}

/** Grandes régions IANA, en français — sert à regrouper le sélecteur de fuseau */
const REGION_FR: Record<string, string> = {
  Africa: 'Afrique',
  America: 'Amériques',
  Antarctica: 'Antarctique',
  Arctic: 'Arctique',
  Asia: 'Asie',
  Atlantic: 'Atlantique',
  Australia: 'Australie',
  Europe: 'Europe',
  Indian: 'Océan Indien',
  Pacific: 'Pacifique',
}

/** Libellé court d’un fuseau : "Paris", "New York", "Varsovie" */
export function timezoneCity(tz: string): string {
  return CITY_FR[tz] ?? (tz.split('/').pop() ?? tz).replace(/_/g, ' ')
}

/** Région d’un fuseau, en français : "Europe", "Amériques"… ("Autres" si l’identifiant n’en porte pas) */
export function timezoneRegion(tz: string): string {
  if (!tz.includes('/')) return 'Autres'
  const head = tz.split('/')[0]
  return REGION_FR[head] ?? head.replace(/_/g, ' ')
}

/** Libellé complet, pour une liste sans regroupement : "Europe · Varsovie" */
export function timezoneLabel(tz: string): string {
  const city = timezoneCity(tz)
  const region = timezoneRegion(tz)
  return region === 'Autres' ? city : `${region} · ${city}`
}

/** Heure formatée dans un fuseau */
export function formatTimeIn(tz: string, at: Date = new Date()): string {
  try {
    return at.toLocaleTimeString('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--:--'
  }
}

/** Composantes (année/mois/jour/heure/minute) d’un instant, lues DANS un fuseau donné */
function zonedParts(tz: string, at: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

/** Clé civile "yyyy-MM-dd" d’un instant, vue depuis un fuseau — sert à regrouper les événements par jour */
export function zonedDateKey(tz: string, at: Date): string {
  try {
    const p = zonedParts(tz, at)
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  } catch {
    return '--'
  }
}

/** Valeur d’un <input type="datetime-local"> ("yyyy-MM-ddTHH:mm") représentant un instant DANS un fuseau donné */
export function toZonedInputValue(tz: string, at: Date): string {
  const p = zonedParts(tz, at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/**
 * Interprète une heure murale ("yyyy-MM-ddTHH:mm", saisie SANS fuseau) comme étant
 * exprimée dans `tz`, et renvoie l’instant UTC (Date) correspondant. Gère les bascules DST.
 */
export function zonedInputToDate(tz: string, wall: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall)
  if (!m) return new Date(NaN)
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  // L’offset dépend de l’instant (DST) : on l’estime, puis on affine une fois si on a franchi une bascule.
  const off1 = utcOffsetMinutes(tz, new Date(asUtc))
  let ms = asUtc - off1 * 60000
  const off2 = utcOffsetMinutes(tz, new Date(ms))
  if (off2 !== off1) ms = asUtc - off2 * 60000
  return new Date(ms)
}

/** Date de calendrier (minuit heure locale du navigateur) correspondant au jour civil d’un instant vu dans `tz` */
export function zonedCivilDate(tz: string, at: Date): Date {
  const p = zonedParts(tz, at)
  return new Date(p.year, p.month - 1, p.day)
}

/** Jour + heure lisibles ("mer. 3 · 18:00") d’un instant, vus depuis un fuseau donné */
export function formatDayTimeIn(tz: string, at: Date): string {
  try {
    const day = at.toLocaleDateString('fr-FR', { timeZone: tz, weekday: 'short', day: 'numeric' })
    return `${day} · ${formatTimeIn(tz, at)}`
  } catch {
    return '--'
  }
}

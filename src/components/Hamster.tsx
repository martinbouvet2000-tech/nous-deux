import { useId } from 'react'
import type { MoodState } from '@/types/database'

/**
 * Mascotte hamster d'Awy — un seul dessin vectoriel, 12 expressions.
 * Même géométrie partout (tête, oreilles, joues, pattes) ; seuls yeux, bouche,
 * sourcils, oreilles et petits accessoires changent. Couleurs de la palette de l'app.
 */
const FUR = '#E8C9A0'
const FUR_DARK = '#C9A27A'
const BELLY = '#F6EBDC'
const INK = '#2B2420'
const BLUSH = '#D99AAD'

interface Props {
  state: MoodState | null
  size?: number
  className?: string
  /** Mascotte inactive (aucune humeur choisie) : grisée et endormie */
  dim?: boolean
}

export default function Hamster({ state, size = 64, className = '', dim = false }: Props) {
  const s = state ?? 'peaceful'
  const earDrop = s === 'down' ? 10 : s === 'bored' ? 7 : s === 'sick' ? 6 : s === 'tired' ? 5 : s === 'angry' ? -3 : 0
  // L'accueil affiche deux hamsters (toi + l'autre) : un identifiant de dégradé en dur
  // se retrouvait deux fois dans la page — HTML invalide, et le second `url(#…)` pointe
  // alors sur le dégradé du premier. `useId()` en donne un par instance ; on le nettoie
  // des caractères décoratifs que React y met (« «r0» ») pour rester lisible dans le DOM.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const furId = `hm-fur-${uid}`
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden="true" style={dim ? { filter: 'grayscale(0.7) opacity(0.55)' } : undefined}>
      <defs>
        <radialGradient id={furId} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#F2DAB6" />
          <stop offset="1" stopColor={FUR} />
        </radialGradient>
      </defs>

      {/* Oreilles */}
      <g transform={`translate(0 ${earDrop})`}>
        <ellipse cx="34" cy="34" rx="13" ry="15" fill={FUR_DARK} transform={`rotate(${-15 + earDrop} 34 34)`} />
        <ellipse cx="34" cy="35" rx="7" ry="9" fill={BLUSH} opacity="0.55" transform={`rotate(${-15 + earDrop} 34 34)`} />
        <ellipse cx="86" cy="34" rx="13" ry="15" fill={FUR_DARK} transform={`rotate(${15 - earDrop} 86 34)`} />
        <ellipse cx="86" cy="35" rx="7" ry="9" fill={BLUSH} opacity="0.55" transform={`rotate(${15 - earDrop} 86 34)`} />
      </g>

      {/* Tête / corps */}
      <path d="M60 22c26 0 44 18 44 42 0 26-20 40-44 40S16 90 16 64c0-24 18-42 44-42z" fill={`url(#${furId})`} />
      {/* Tache sur le front */}
      <path d="M60 24c6 0 11 4 12 10-4 3-9 4-12 4s-8-1-12-4c1-6 6-10 12-10z" fill={FUR_DARK} opacity="0.55" />
      {/* Ventre / museau clair */}
      <ellipse cx="60" cy="78" rx="26" ry="18" fill={BELLY} />

      {/* Joues */}
      <ellipse cx="30" cy="72" rx="11" ry="8" fill={s === 'sick' ? '#B9C99A' : BLUSH} opacity={s === 'joyful' || s === 'proud' || s === 'love' || s === 'excited' || s === 'sick' ? 0.6 : 0.32} />
      <ellipse cx="90" cy="72" rx="11" ry="8" fill={s === 'sick' ? '#B9C99A' : BLUSH} opacity={s === 'joyful' || s === 'proud' || s === 'love' || s === 'excited' || s === 'sick' ? 0.6 : 0.32} />

      {/* Pattes */}
      <ellipse cx="44" cy="98" rx="9" ry="5" fill={FUR_DARK} />
      <ellipse cx="76" cy="98" rx="9" ry="5" fill={FUR_DARK} />

      {/* Moustaches */}
      <g stroke={INK} strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round">
        <path d="M22 78h12M22 84l12-2M98 78H86M98 84l-12-2" />
      </g>

      {/* Nez */}
      <ellipse cx="60" cy="69" rx="4" ry="3" fill="#B77382" />

      {/* Yeux + bouche selon l'état */}
      <Face state={s} />
    </svg>
  )
}

/** Petit cœur centré sur (cx,cy) — sert d'œil « amoureux » ou d'accessoire flottant. */
function heartPath(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy + r * 0.95}C${cx - r * 1.5} ${cy - r * 0.35} ${cx - r * 0.65} ${cy - r * 1.35} ${cx} ${cy - r * 0.45}C${cx + r * 0.65} ${cy - r * 1.35} ${cx + r * 1.5} ${cy - r * 0.35} ${cx} ${cy + r * 0.95}Z`
}

function Face({ state }: { state: MoodState }) {
  const eyeL = { x: 46, y: 58 }
  const eyeR = { x: 74, y: 58 }
  switch (state) {
    case 'joyful':
      return (
        <g fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round">
          {/* yeux en arc heureux */}
          <path d={`M${eyeL.x - 5} ${eyeL.y + 1} q5 -6 10 0`} />
          <path d={`M${eyeR.x - 5} ${eyeR.y + 1} q5 -6 10 0`} />
          {/* grand sourire */}
          <path d="M50 76q10 9 20 0" />
          <path d="M56 75q4 3 8 0" strokeWidth="1.6" />
        </g>
      )
    case 'proud':
      return (
        <g>
          <circle cx={eyeL.x} cy={eyeL.y} r="3.6" fill={INK} />
          <circle cx={eyeR.x} cy={eyeR.y} r="3.6" fill={INK} />
          <circle cx={eyeL.x + 1.4} cy={eyeL.y - 1.4} r="1.2" fill="#fff" />
          <circle cx={eyeR.x + 1.4} cy={eyeR.y - 1.4} r="1.2" fill="#fff" />
          {/* sourcils confiants */}
          <path d={`M${eyeL.x - 6} ${eyeL.y - 9} l10 -2M${eyeR.x + 6} ${eyeR.y - 9} l-10 -2`} stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          {/* sourire en coin */}
          <path d="M52 76q8 7 18 -1" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          {/* étincelles */}
          <g fill="#E8C9A0">
            <path d="M100 26l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
            <path d="M17 44l1.4 3.5 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z" />
          </g>
        </g>
      )
    case 'peaceful':
      return (
        <g fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round">
          {/* yeux fermés doux (arcs vers le bas) */}
          <path d={`M${eyeL.x - 5} ${eyeL.y - 1} q5 5 10 0`} />
          <path d={`M${eyeR.x - 5} ${eyeR.y - 1} q5 5 10 0`} />
          <path d="M54 76q6 4 12 0" />
          {/* petite feuille */}
          <path d="M96 18c6 0 10 4 10 10-6 0-10-4-10-10z" fill="#8FB3A9" stroke="none" />
          <path d="M96 18l10 10" stroke="#6F978C" strokeWidth="1.2" />
        </g>
      )
    case 'tired':
      return (
        <g>
          {/* paupières lourdes */}
          <path d={`M${eyeL.x - 5} ${eyeL.y} q5 4 10 0`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          <path d={`M${eyeR.x - 5} ${eyeR.y} q5 4 10 0`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          <path d={`M${eyeL.x - 6} ${eyeL.y - 6} q6 2 12 0M${eyeR.x - 6} ${eyeR.y - 6} q6 2 12 0`} fill="none" stroke={INK} strokeOpacity="0.4" strokeWidth="1.6" strokeLinecap="round" />
          {/* bâillement */}
          <ellipse cx="60" cy="78" rx="4" ry="5" fill={INK} opacity="0.85" />
          {/* z z */}
          <g fill="#E8C9A0" opacity="0.9" fontFamily="Fraunces Variable, Georgia, serif" fontStyle="italic" fontWeight="600">
            <text x="92" y="30" fontSize="11">z</text>
            <text x="100" y="20" fontSize="14">z</text>
          </g>
        </g>
      )
    case 'stressed':
      return (
        <g>
          <circle cx={eyeL.x} cy={eyeL.y} r="4.2" fill={INK} />
          <circle cx={eyeR.x} cy={eyeR.y} r="4.2" fill={INK} />
          <circle cx={eyeL.x - 1.2} cy={eyeL.y - 1.4} r="1.4" fill="#fff" />
          <circle cx={eyeR.x - 1.2} cy={eyeR.y - 1.4} r="1.4" fill="#fff" />
          {/* sourcils inquiets */}
          <path d={`M${eyeL.x - 6} ${eyeL.y - 7} l10 -3M${eyeR.x + 6} ${eyeR.y - 7} l-10 -3`} stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          {/* bouche ondulée */}
          <path d="M51 78q4 -4 8 0t8 0 8 0" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          {/* goutte */}
          <path d="M98 52c0 4-3 5-3 9a3 3 0 0 0 6 0c0-4-3-5-3-9z" fill="#9B9CC7" />
          {/* petites lignes d'agitation */}
          <path d="M12 56l6 1M12 62l6-1" stroke={INK} strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )
    case 'focused':
      return (
        <g>
          {/* lunettes rondes */}
          <g fill="none" stroke={INK} strokeWidth="2" strokeOpacity="0.85">
            <circle cx={eyeL.x} cy={eyeL.y} r="8" />
            <circle cx={eyeR.x} cy={eyeR.y} r="8" />
            <path d={`M${eyeL.x + 8} ${eyeL.y} h${eyeR.x - eyeL.x - 16}`} />
            <path d={`M${eyeL.x - 8} ${eyeL.y} l-8 -2M${eyeR.x + 8} ${eyeR.y} l8 -2`} />
          </g>
          <circle cx={eyeL.x} cy={eyeL.y} r="2.8" fill={INK} />
          <circle cx={eyeR.x} cy={eyeR.y} r="2.8" fill={INK} />
          {/* sourcils concentrés */}
          <path d={`M${eyeL.x - 6} ${eyeL.y - 12} l10 1M${eyeR.x + 6} ${eyeR.y - 12} l-10 1`} stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          {/* bouche droite décidée */}
          <path d="M54 77h12" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )
    case 'love':
      return (
        <g>
          {/* yeux en cœur */}
          <path d={heartPath(eyeL.x, eyeL.y, 5)} fill="#E86A8C" />
          <path d={heartPath(eyeR.x, eyeR.y, 5)} fill="#E86A8C" />
          <path d={heartPath(eyeL.x - 1.4, eyeL.y - 1.6, 1.5)} fill="#fff" opacity="0.85" />
          <path d={heartPath(eyeR.x - 1.4, eyeR.y - 1.6, 1.5)} fill="#fff" opacity="0.85" />
          {/* sourire tendre */}
          <path d="M52 76q8 7 16 0" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          {/* cœurs qui flottent */}
          <path d={heartPath(102, 30, 4.5)} fill="#E68AA8" />
          <path d={heartPath(96, 18, 3)} fill="#E68AA8" opacity="0.75" />
        </g>
      )
    case 'excited':
      return (
        <g>
          {/* grands yeux ouverts et brillants */}
          <circle cx={eyeL.x} cy={eyeL.y} r="5.4" fill={INK} />
          <circle cx={eyeR.x} cy={eyeR.y} r="5.4" fill={INK} />
          <circle cx={eyeL.x + 1.8} cy={eyeL.y - 1.8} r="1.8" fill="#fff" />
          <circle cx={eyeR.x + 1.8} cy={eyeR.y - 1.8} r="1.8" fill="#fff" />
          {/* sourcils levés d'enthousiasme */}
          <path d={`M${eyeL.x - 6} ${eyeL.y - 10} q5 -4 11 -1M${eyeR.x - 5} ${eyeR.y - 11} q6 -3 11 1`} fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          {/* grand sourire ouvert */}
          <path d="M50 74q10 12 20 0z" fill={INK} opacity="0.9" />
          <path d="M53 76q7 5 14 0" fill="#E86A8C" opacity="0.85" />
          {/* étincelles d'énergie */}
          <g stroke="#F4B45C" strokeWidth="1.8" strokeLinecap="round">
            <path d="M102 40l4 -4M104 48l5 -1M99 33l2 -5" />
            <path d="M18 46l-4 -4M16 54l-5 -1" />
          </g>
        </g>
      )
    case 'bored':
      return (
        <g>
          {/* paupières mi-closes, regard qui décroche sur le côté */}
          <path d={`M${eyeL.x - 6} ${eyeL.y} h12M${eyeR.x - 6} ${eyeR.y} h12`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          <circle cx={eyeL.x - 3} cy={eyeL.y + 2.4} r="1.9" fill={INK} />
          <circle cx={eyeR.x - 3} cy={eyeR.y + 2.4} r="1.9" fill={INK} />
          {/* petit bâillement */}
          <ellipse cx="62" cy="78" rx="3.2" ry="4" fill={INK} opacity="0.8" />
          {/* soupir : points en suspens */}
          <g fill={INK} opacity="0.35">
            <circle cx="94" cy="30" r="1.6" />
            <circle cx="100" cy="26" r="1.9" />
            <circle cx="107" cy="22" r="2.2" />
          </g>
        </g>
      )
    case 'sick':
      return (
        <g>
          {/* yeux fatigués, plissés (^ ^ inversés doux) */}
          <path d={`M${eyeL.x - 5} ${eyeL.y + 1} q5 3 10 0M${eyeR.x - 5} ${eyeR.y + 1} q5 3 10 0`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          {/* sourcils souffrants */}
          <path d={`M${eyeL.x - 6} ${eyeL.y - 6} q6 -1 11 1M${eyeR.x - 5} ${eyeR.y - 5} q5 -2 11 -1`} fill="none" stroke={INK} strokeOpacity="0.4" strokeWidth="1.6" strokeLinecap="round" />
          {/* petite bouche crispée */}
          <path d="M55 79q5 -3 10 0" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          {/* thermomètre */}
          <g transform="rotate(24 78 84)">
            <rect x="66" y="82" width="20" height="4" rx="2" fill="#EEE7DC" stroke={INK} strokeOpacity="0.5" strokeWidth="0.8" />
            <circle cx="88" cy="84" r="3.4" fill="#D96B6B" />
            <rect x="70" y="83" width="14" height="2" rx="1" fill="#D96B6B" opacity="0.8" />
          </g>
          {/* patch de fièvre sur le front */}
          <g transform="rotate(-8 60 40)">
            <rect x="50" y="36" width="20" height="7" rx="2" fill="#F2C7C7" stroke={INK} strokeOpacity="0.35" strokeWidth="0.8" />
            <path d="M55 36v7M60 36v7M65 36v7" stroke={INK} strokeOpacity="0.2" strokeWidth="0.7" />
          </g>
        </g>
      )
    case 'angry':
      return (
        <g>
          {/* yeux resserrés */}
          <circle cx={eyeL.x} cy={eyeL.y + 1} r="3.6" fill={INK} />
          <circle cx={eyeR.x} cy={eyeR.y + 1} r="3.6" fill={INK} />
          {/* sourcils froncés en V vers le centre */}
          <path d={`M${eyeL.x - 6} ${eyeL.y - 9} l11 5M${eyeR.x + 6} ${eyeR.y - 9} l-11 5`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          {/* bouche boudeuse / crispée */}
          <path d="M52 80q8 -6 16 0" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          {/* volutes de vapeur (colère) */}
          <g fill="none" stroke="#D97B6C" strokeWidth="2" strokeLinecap="round" opacity="0.85">
            <path d="M96 40q4 -3 1 -7t1 -7" />
            <path d="M104 44q4 -3 1 -7t1 -7" />
          </g>
        </g>
      )
    case 'down':
    default:
      return (
        <g>
          <circle cx={eyeL.x} cy={eyeL.y + 1} r="3.4" fill={INK} />
          <circle cx={eyeR.x} cy={eyeR.y + 1} r="3.4" fill={INK} />
          <circle cx={eyeL.x + 1} cy={eyeL.y} r="1.1" fill="#fff" />
          <circle cx={eyeR.x + 1} cy={eyeR.y} r="1.1" fill="#fff" />
          {/* sourcils tristes */}
          <path d={`M${eyeL.x - 6} ${eyeL.y - 7} l10 -3M${eyeR.x + 6} ${eyeR.y - 7} l-10 -3`} stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          {/* bouche vers le bas */}
          <path d="M53 80q7 -6 14 0" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          {/* larme */}
          <path d={`M${eyeR.x + 6} ${eyeR.y + 6}c0 3-2.2 4-2.2 7a2.2 2.2 0 0 0 4.4 0c0-3-2.2-4-2.2-7z`} fill="#9B9CC7" />
        </g>
      )
  }
}

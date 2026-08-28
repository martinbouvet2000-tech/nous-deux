import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Décide si le décor animé de l'app (aurores CSS + braises au canvas) a le droit
 * de tourner, et à quelle cadence.
 *
 * Le fond d'Awy tournait en continu : ~20 % de CPU en permanence, y compris
 * quand l'écran affiche un texte que personne ne lit depuis dix minutes. Sur un
 * téléphone, c'est de la batterie brûlée pour rien. Ce hook met la boucle en
 * pause dès qu'elle ne sert à rien :
 *
 *   - onglet caché (`document.visibilityState === 'hidden'`) ;
 *   - inactivité : plus aucun geste ni frappe depuis IDLE_DELAY_MS ;
 *   - `prefers-reduced-motion: reduce` : on ne bouge pas du tout (image fixe).
 *
 * La reprise est immédiate au premier geste, et visuellement continue : rien
 * n'est réinitialisé pendant la pause, les braises repartent d'où elles se sont
 * arrêtées (voir Backdrop, qui recale son horloge à la reprise pour éviter un
 * saut proportionnel à la durée de pause).
 *
 * Sur les appareils modestes ou en batterie faible, on ne coupe rien : on divise
 * simplement la cadence par deux — moins visible qu'une animation absente.
 *
 * Le calcul lui-même est isolé dans `computeMotionBudget`, une fonction pure,
 * pour être testable sans DOM.
 */

/** Délai sans geste au bout duquel on considère l'utilisateur inactif. */
export const IDLE_DELAY_MS = 30_000

/** Cadence nominale : les braises dérivent lentement, 24 i/s suffisent. */
export const FPS_NORMAL = 24
/** Cadence réduite (appareil modeste ou batterie faible non branchée). */
export const FPS_FRUGAL = 12

/** Seuil de cœurs logiques en dessous duquel on passe en cadence réduite. */
const FRUGAL_CORES = 4
/** Seuil de charge en dessous duquel on passe en cadence réduite (si débranché). */
const LOW_BATTERY = 0.2

/** Signaux bruts observés sur l'appareil. */
export interface MotionSignals {
  /** L'onglet est en arrière-plan. */
  hidden: boolean
  /** Aucun geste depuis le délai d'inactivité. */
  idle: boolean
  /** L'utilisateur a demandé à réduire les animations. */
  reduced: boolean
  /** Appareil peu puissant ou batterie faible : on lève le pied. */
  frugal: boolean
}

/** Décision transmise au composant qui anime. */
export interface MotionBudget {
  /** La boucle d'animation doit tourner (sinon : l'annuler, pas juste sauter le rendu). */
  active: boolean
  /** Mode image fixe : on dessine une image et on n'anime jamais. */
  reduced: boolean
  /** Durée minimale entre deux images, en millisecondes. */
  frameMs: number
}

/**
 * Cœur de la décision, sans DOM ni horloge : c'est cette fonction qui est testée.
 *
 * `reduced` gagne sur tout le reste : accessibilité d'abord. Il implique
 * `active: false`, le composant se contentant alors d'une image fixe.
 */
export function computeMotionBudget(signals: MotionSignals): MotionBudget {
  const { hidden, idle, reduced, frugal } = signals
  return {
    active: !reduced && !hidden && !idle,
    reduced,
    frameMs: 1000 / (frugal ? FPS_FRUGAL : FPS_NORMAL),
  }
}

/** Sous-ensemble de la Battery Status API : non standard, absente sur iOS. */
interface BatteryLike {
  level: number
  charging: boolean
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}
type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryLike> }

/** Gestes qui témoignent d'une présence humaine devant l'écran. */
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Version « branchée sur le navigateur » de `computeMotionBudget`.
 *
 * @param idleDelayMs délai d'inactivité avant mise en pause (injectable pour les tests).
 */
export function useMotionBudget(idleDelayMs: number = IDLE_DELAY_MS): MotionBudget {
  const [hidden, setHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  )
  const [idle, setIdle] = useState(false)
  const [reduced, setReduced] = useState(prefersReducedMotion)
  const [frugal, setFrugal] = useState(
    () => (navigator.hardwareConcurrency ?? 8) <= FRUGAL_CORES
  )

  // Horodatage du dernier geste. Un ref, pas un state : `pointermove` part à
  // 60 Hz, il ne doit surtout pas provoquer de rendu React.
  const lastActivityRef = useRef(Date.now())

  // ── Onglet caché ────────────────────────────────────────────────────────
  useEffect(() => {
    const onVisibility = () => {
      const isHidden = document.visibilityState === 'hidden'
      setHidden(isHidden)
      // Revenir sur l'onglet est en soi un signe de présence : on repart d'une
      // fenêtre d'inactivité neuve plutôt que de reprendre pour se recouper
      // aussitôt si la mise en veille a duré plus de 30 s.
      if (!isHidden) {
        lastActivityRef.current = Date.now()
        setIdle(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // ── prefers-reduced-motion ──────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // ── Inactivité ──────────────────────────────────────────────────────────
  // Un seul timer, ré-armé pour le temps restant quand il se déclenche trop
  // tôt : aucun `clearTimeout`/`setTimeout` par mouvement de souris.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const arm = () => {
      const remaining = idleDelayMs - (Date.now() - lastActivityRef.current)
      if (remaining <= 0) {
        setIdle(true)
        return // plus de timer : c'est le prochain geste qui relancera tout
      }
      timer = setTimeout(arm, remaining)
    }

    const onActivity = () => {
      const wasIdle = Date.now() - lastActivityRef.current >= idleDelayMs
      lastActivityRef.current = Date.now()
      if (wasIdle) {
        setIdle(false)
        if (timer) clearTimeout(timer)
        arm()
      }
    }

    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { passive: true })
    }
    arm()

    return () => {
      if (timer) clearTimeout(timer)
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity)
    }
  }, [idleDelayMs])

  // ── Batterie faible (optionnel : API absente sur iOS et Firefox) ─────────
  useEffect(() => {
    const getBattery = (navigator as NavigatorWithBattery).getBattery
    if (typeof getBattery !== 'function') return

    let battery: BatteryLike | null = null
    let cancelled = false
    const lowCores = (navigator.hardwareConcurrency ?? 8) <= FRUGAL_CORES
    const sync = () => {
      if (!battery) return
      setFrugal(lowCores || (!battery.charging && battery.level <= LOW_BATTERY))
    }

    getBattery.call(navigator).then(
      (b) => {
        if (cancelled) return
        battery = b
        b.addEventListener('levelchange', sync)
        b.addEventListener('chargingchange', sync)
        sync()
      },
      () => {
        /* API refusée par le navigateur : on garde la cadence nominale. */
      }
    )

    return () => {
      cancelled = true
      battery?.removeEventListener('levelchange', sync)
      battery?.removeEventListener('chargingchange', sync)
    }
  }, [])

  return useMemo(
    () => computeMotionBudget({ hidden, idle, reduced, frugal }),
    [hidden, idle, reduced, frugal]
  )
}

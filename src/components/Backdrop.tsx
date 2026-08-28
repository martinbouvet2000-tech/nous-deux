import { useEffect, useRef } from 'react'
import { useMotionBudget } from '@/hooks/useMotionBudget'

/**
 * Fond vivant de l'app : deux aurores qui dérivent lentement + des braises/lucioles
 * dessinées au canvas, teintées par l'humeur du couple.
 *
 * Économie d'énergie (point 20 de l'audit) : ce décor tournait en continu, y compris
 * onglet caché ou téléphone posé sur la table, pour ~20 % de CPU permanents. Le
 * budget d'animation est désormais délégué à `useMotionBudget`, qui coupe tout
 * quand ça ne sert à rien :
 *   - `prefers-reduced-motion: reduce` → une image fixe, aucune boucle ;
 *   - onglet caché → boucle ANNULÉE (pas seulement un rendu sauté) ;
 *   - 30 s sans le moindre geste → même chose, reprise au premier mouvement ;
 *   - appareil modeste ou batterie faible → cadence divisée par deux.
 *
 * La reprise est volontairement sans à-coup : rien n'est réinitialisé pendant la
 * pause (les braises restent où elles sont, les aurores CSS sont simplement
 * `paused` puis `running`), et l'horloge de la boucle est recalée au redémarrage
 * pour que le premier `dt` vaille une image et non toute la durée de la pause.
 */
interface Props {
  /** Couleur d'accent (rgba) pilotée par l'humeur */
  glowA?: string
  glowB?: string
}

interface Ember {
  x: number; y: number; r: number; vx: number; vy: number
  life: number; maxLife: number; hue: 0 | 1; twinkle: number
}

/** Poignée exposée par l'effet de mise en place, pilotée par le budget d'animation. */
interface Controls {
  start: () => void
  stop: () => void
  /** Cadence + mode image fixe. Redessine si l'on est déjà en pause. */
  configure: (frameMs: number, still: boolean) => void
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function Backdrop({ glowA = 'rgba(212,165,116,0.16)', glowB = 'rgba(194,120,142,0.12)' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const haloRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<Controls | null>(null)

  const { active, reduced: isReduced, frameMs } = useMotionBudget()

  // Halo qui suit le curseur (desktop uniquement, pointer fin)
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches || reduced()) return
    let raf = 0
    let x = -200, y = -200
    const onMove = (e: MouseEvent) => {
      x = e.clientX; y = e.clientY
      if (!raf) raf = requestAnimationFrame(() => {
        haloRef.current?.style.setProperty('--cx', `${x}px`)
        haloRef.current?.style.setProperty('--cy', `${y}px`)
        raf = 0
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  }, [])

  // Braises — mise en place (une seule fois) ; le démarrage/l'arrêt est piloté
  // par l'effet suivant, via `controlsRef`.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return
    let w = 0, h = 0, dpr = 1
    let embers: Ember[] = []
    let raf = 0
    let frame = 1000 / 24 // valeur de départ, remplacée aussitôt par configure()
    let still = false     // image fixe : on dessine, on n'anime pas
    let last = performance.now()

    // Sprites pré-rendus (un dégradé radial par couleur, une seule fois) au lieu de 70 gradients/frame
    const sprite = (rgb: string) => {
      const c = document.createElement('canvas'); c.width = c.height = 64
      const g = c.getContext('2d')!
      const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      rg.addColorStop(0, `rgba(${rgb},1)`); rg.addColorStop(0.25, `rgba(${rgb},0.35)`); rg.addColorStop(1, `rgba(${rgb},0)`)
      g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return c
    }
    const SPR = [sprite('212,165,116'), sprite('194,120,142')]

    const COUNT = () => Math.min(48, Math.max(22, Math.round((w * h) / 32000)))

    const spawn = (initial = false): Ember => {
      const maxLife = 9000 + Math.random() * 9000
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : h + 10,
        r: 0.6 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.06,
        vy: -(0.03 + Math.random() * 0.07),
        life: initial ? Math.random() * maxLife : 0,
        maxLife,
        hue: Math.random() < 0.7 ? 0 : 1,
        twinkle: Math.random() * Math.PI * 2,
      }
    }

    /**
     * `dt = 0` = simple repeinture, sans faire avancer les braises : c'est ce qui
     * permet de redessiner à l'identique en pause (redimensionnement, image fixe)
     * sans décaler quoi que ce soit à l'écran.
     */
    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i]
        if (dt > 0) {
          e.life += dt
          e.x += e.vx * dt * 0.06 + Math.sin((e.life + e.twinkle * 1000) / 2400) * 0.08
          e.y += e.vy * dt * 0.06
          if (e.life > e.maxLife || e.y < -10) { embers[i] = spawn(); continue }
        }
        const t = e.life / e.maxLife
        const fade = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1
        const tw = 0.65 + 0.35 * Math.sin(e.life / 600 + e.twinkle)
        // Zone d'exclusion : le tiers central (où vit le texte) reste plus calme
        const centerBand = Math.abs(e.x / w - 0.5) < 0.2 ? 0.45 : 1
        const a = fade * tw * centerBand
        const R = e.r * 7
        ctx.globalAlpha = 0.55 * a
        ctx.drawImage(SPR[e.hue], e.x - R, e.y - R, R * 2, R * 2)
      }
      ctx.globalAlpha = 1
    }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = window.innerWidth; h = window.innerHeight
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      embers = Array.from({ length: COUNT() }, () => spawn(true))
      // En pause, le canvas vient d'être vidé par le redimensionnement : on
      // repeint une image, sinon le fond disparaîtrait jusqu'au prochain geste.
      if (!raf) draw(0)
    }

    const loop = (now: number) => {
      if (now - last < frame) { raf = requestAnimationFrame(loop); return }
      const dt = Math.min(80, now - last); last = now
      draw(dt)
      raf = requestAnimationFrame(loop)
    }

    const start = () => {
      if (raf || still) return
      // Recalage de l'horloge : sans lui, le premier `dt` après une pause de
      // dix minutes ferait bondir toutes les braises d'un coup.
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }

    const stop = () => {
      if (!raf) return
      cancelAnimationFrame(raf) // on annule vraiment la boucle
      raf = 0
    }

    const configure = (nextFrameMs: number, nextStill: boolean) => {
      frame = nextFrameMs
      still = nextStill
      if (still) { stop(); draw(0) }
    }

    controlsRef.current = { start, stop, configure }

    resize()
    window.addEventListener('resize', resize)
    return () => {
      stop()
      controlsRef.current = null
      window.removeEventListener('resize', resize)
    }
  }, [])

  // Braises — pilotage : c'est ici que la boucle est réellement annulée/relancée.
  useEffect(() => {
    const c = controlsRef.current
    if (!c) return
    c.configure(frameMs, isReduced)
    if (active) c.start()
    else c.stop()
  }, [active, isReduced, frameMs])

  // Aurores CSS : `paused` fige la transformation en cours et `running` la
  // reprend exactement au même point — pas de saut, pas de flash.
  const auroraPlayState = active ? 'running' : 'paused'

  return (
    <>
      {/* Aurores */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 [contain:strict]" aria-hidden="true">
        <div
          className="aurora absolute -top-[10%] -left-[5%] w-[36vw] h-[36vw] max-w-[460px] max-h-[460px] rounded-full animate-aurora-1 will-change-transform"
          style={{ ['--glow' as string]: glowA, animationPlayState: auroraPlayState }}
        />
        <div
          className="aurora absolute -bottom-[12%] -right-[8%] w-[38vw] h-[38vw] max-w-[500px] max-h-[500px] rounded-full animate-aurora-2 will-change-transform"
          style={{ ['--glow' as string]: glowB, animationPlayState: auroraPlayState }}
        />
        {/* Vignette douce pour concentrer l'œil */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 30%, transparent 50%, rgba(8,7,6,0.55) 100%)' }} />
      </div>
      {/* Braises */}
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" aria-hidden="true" />
      {/* Halo curseur */}
      <div ref={haloRef} className="cursor-halo hidden md:block" aria-hidden="true" />
    </>
  )
}

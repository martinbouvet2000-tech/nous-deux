import { useEffect, useRef } from 'react'

/**
 * Compteur qui "monte" jusqu'à sa valeur au premier affichage, en écrivant directement
 * dans le DOM (aucun re-rendu du parent). Respecte prefers-reduced-motion.
 */
export default function CountUp({ to, ms = 700, pad = 0, className = '' }: { to: number; ms?: number; pad?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fmt = (v: number) => String(v).padStart(pad, '0')
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const start = from.current ?? 0
    if (reduced || from.current === to || from.current !== null) { el.textContent = fmt(to); from.current = to; return }
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      const eased = 1 - Math.pow(1 - t, 3)
      el.textContent = fmt(Math.round(start + (to - start) * eased))
      if (t < 1) raf = requestAnimationFrame(step)
      else from.current = to
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, ms, pad])
  return <span ref={ref} className={`num ${className}`}>{String(to).padStart(pad, '0')}</span>
}

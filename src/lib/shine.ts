import type { MouseEvent } from 'react'

/** Met à jour --mx/--my sur la carte pour que le reflet suive le curseur (voir .lux-card) */
export function shine(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
  el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
}
export function unshine(e: MouseEvent<HTMLElement>) {
  e.currentTarget.style.removeProperty('--mx')
  e.currentTarget.style.removeProperty('--my')
}

/** Filet décoratif avec un petit joyau central — pour coiffer les sections */
export default function Ornament({ className = '' }: { className?: string }) {
  return (
    <div className={`ornament ${className}`} aria-hidden="true">
      <svg width="26" height="10" viewBox="0 0 26 10" fill="none">
        <path d="M13 1 L17 5 L13 9 L9 5 Z" fill="currentColor" opacity="0.9" />
        <path d="M3 5 L6 5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
        <path d="M20 5 L23 5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      </svg>
    </div>
  )
}

import { AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY } from '@/lib/ui'
import { useConfirmStore } from '@/lib/confirm'

export default function ConfirmDialogHost() {
  const { open, options, close } = useConfirmStore()
  if (!open) return null
  const { title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false } = options
  return (
    <Modal title={title} onClose={() => close(false)}>
      <div className="flex items-start gap-3">
        {danger && (
          <div className="w-9 h-9 rounded-xl bg-[rgba(239,68,68,0.12)] flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-red-300" aria-hidden="true" />
          </div>
        )}
        <p className="text-sm text-[#F0EAE0]/85 leading-relaxed">{message ?? 'Cette action est définitive.'}</p>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => close(false)} className={`${BTN_GHOST} flex-1`}>{cancelLabel}</button>
        <button onClick={() => close(true)} className={`${danger ? BTN_DANGER : BTN_PRIMARY} flex-1`} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

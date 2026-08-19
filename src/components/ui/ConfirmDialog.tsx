import { AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY } from '@/lib/ui'
import { useConfirmStore } from '@/lib/confirm'

export default function ConfirmDialogHost() {
  const { open, options, close } = useConfirmStore()
  if (!open) return null
  const { title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false } = options
  return (
    <Modal title={title} description={message ?? 'Cette action est définitive.'} onClose={() => close(false)} alert>
      {danger && (
        <div className="flex items-center gap-2 text-[13px] text-[#F0A5AD]/90">
          <AlertTriangle size={15} aria-hidden="true" /> Action irréversible
        </div>
      )}
      <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
        {/* Le focus par défaut est sur l'action sûre */}
        <button onClick={() => close(false)} className={`${BTN_GHOST} flex-1`} autoFocus>{cancelLabel}</button>
        <button onClick={() => close(true)} className={`${danger ? BTN_DANGER : BTN_PRIMARY} flex-1`}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` makes the confirm button red (Exit / leave). */
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal confirmation on the native <dialog>: focus is trapped, Esc cancels, the page behind
 * is inert. Focus starts on Cancel so a stray Enter never confirms a destructive action.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    if (!open && dlg.open) dlg.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Esc fires `cancel`; keep React state as the source of truth.
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      // Click on the backdrop (the dialog element itself) cancels.
      onClick={(e) => {
        if (e.target === ref.current) onCancel()
      }}
      className="fixed inset-0 !m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-surface p-0 text-ink shadow-xl"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        {description && (
          <div id={descId} className="mt-2 text-sm text-muted">
            {description}
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">
        <Button variant="ghost" onClick={onCancel} autoFocus>
          {cancelLabel}
        </Button>
        <Button variant={tone === 'danger' ? 'exit' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}

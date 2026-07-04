import { useId, useState } from 'react'

export function MetricExplanation({ title, triggerLabel = '如何计算？', children }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="metric-explanation">
      <button
        type="button"
        className="text-button"
        aria-label={`${title} ${triggerLabel}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {triggerLabel}
      </button>
      {open ? (
        <div className="explanation-panel" id={panelId}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

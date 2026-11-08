import { useState } from 'react'
import { toLocalInputValue } from '../bottleFeeding'
import { FEEDING_MODES, FEEDING_MODE_LABEL, loadFeedingMode } from '../feedingMode'
import { useCreateBottleFeeding } from '../services/feeding'
import BottleFeedingForm from './BottleFeedingForm'

export default function FeedingPanel({ babyId }) {
  const [mode, setMode] = useState(loadFeedingMode)
  // The time belongs to the sheet, not to a mode form: switching mode keeps it (D18-AL).
  const [time, setTime] = useState(() => toLocalInputValue(new Date()))
  const [notice, setNotice] = useState(null)
  const createBottle = useCreateBottleFeeding(babyId)

  const selectMode = (next) => {
    setMode(next)
    setNotice(null)
  }

  async function saveBottle(body) {
    setNotice(null)
    await createBottle.mutateAsync(body)
    setNotice('Biberon enregistré.')
  }

  return (
    <>
      <div className="seg" role="tablist" aria-label="Mode d'alimentation">
        {FEEDING_MODES.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={`seg-btn ${mode === m ? 'seg-btn--active' : ''}`}
            onClick={() => selectMode(m)}
          >
            {FEEDING_MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {mode === 'bottle' && (
        <BottleFeedingForm key="bottle" time={time} onTimeChange={setTime} onSubmit={saveBottle} />
      )}
      {mode !== 'bottle' && <p className="empty">Bientôt disponible.</p>}

      {notice && <p role="status" className="notice notice--success">{notice}</p>}
    </>
  )
}

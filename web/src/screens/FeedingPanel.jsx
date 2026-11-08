import { useState } from 'react'
import { toLocalInputValue } from '../bottleFeeding'
import { FEEDING_MODES, FEEDING_MODE_LABEL, loadFeedingMode } from '../feedingMode'
import {
  useCreateBottleFeeding,
  useCreateBreastfeeding,
  useLastBreastfeedingReminder,
} from '../services/feeding'
import BottleFeedingForm from './BottleFeedingForm'
import BreastfeedingForm from './BreastfeedingForm'

// Mounted in the breast branch only, so no request leaves in the other modes.
function BreastfeedingReminder({ babyId }) {
  const text = useLastBreastfeedingReminder(babyId)
  return text ? <p className="field-hint">{text}</p> : null
}

export default function FeedingPanel({ babyId }) {
  const [mode, setMode] = useState(loadFeedingMode)
  // The time belongs to the sheet, not to a mode form: switching mode keeps it (D18-AL).
  const [time, setTime] = useState(() => toLocalInputValue(new Date()))
  const [notice, setNotice] = useState(null)
  const createBottle = useCreateBottleFeeding(babyId)
  const createBreast = useCreateBreastfeeding(babyId)

  const selectMode = (next) => {
    setMode(next)
    setNotice(null)
  }

  async function save(mutation, body, message) {
    setNotice(null)
    await mutation.mutateAsync(body)
    setNotice(message)
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
        <BottleFeedingForm
          key="bottle"
          time={time}
          onTimeChange={setTime}
          onSubmit={(body) => save(createBottle, body, 'Biberon enregistré.')}
        />
      )}
      {mode === 'breast' && (
        <>
          <BreastfeedingReminder babyId={babyId} />
          <BreastfeedingForm
            key="breast"
            time={time}
            onTimeChange={setTime}
            onSubmit={(body) => save(createBreast, body, 'Tétée enregistrée.')}
          />
        </>
      )}
      {mode === 'solid' && <p className="empty">Bientôt disponible.</p>}

      {notice && <p role="status" className="notice notice--success">{notice}</p>}
    </>
  )
}

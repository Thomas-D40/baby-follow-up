import { EVENT_TYPE_LABEL } from '../calendar'
import { useUpdateEvent } from '../services/events'
import BottomSheet from './BottomSheet'
import BottleFeedingForm from './BottleFeedingForm'
import BreastfeedingForm from './BreastfeedingForm'
import MedicalCareForm from './MedicalCareForm'
import SolidMealForm from './SolidMealForm'
import StoolForm from './StoolForm'
import TemperatureForm from './TemperatureForm'
import UrineForm from './UrineForm'
import NapEditForm from './NapEditForm'

// Edit sheet of the day recap (US11.2). `editing` is the recap event being edited, or null. The
// sheet closes on success; a failure (409 nap included) is rendered by the form itself.
export default function CalendarEditSheet({ babyId, editing, onClose }) {
  const updateMut = useUpdateEvent(babyId, { onSuccess: onClose })
  const submit = (patch) => updateMut.mutateAsync({ type: editing.type, id: editing.id, patch })

  return (
    <BottomSheet
      open={editing != null}
      title={editing ? <>✏️ Modifier {EVENT_TYPE_LABEL[editing.type].toLowerCase()}</> : null}
      onClose={onClose}
    >
      {editing?.type === 'bottle_feeding' && (
        <BottleFeedingForm
          initial={{ ...editing, occurredAt: editing.startAt }}
          onSubmit={submit}
        />
      )}
      {editing?.type === 'breastfeeding' && (
        <BreastfeedingForm
          initial={{ ...editing, occurredAt: editing.startAt }}
          onSubmit={submit}
        />
      )}
      {editing?.type === 'solid_meal' && (
        <SolidMealForm
          initial={{ ...editing, occurredAt: editing.startAt }}
          onSubmit={submit}
        />
      )}
      {editing?.type === 'stool' && (
        <StoolForm
          initial={{ ...editing, occurredAt: editing.startAt }}
          onSubmit={submit}
        />
      )}
      {editing?.type === 'urine' && (
        <UrineForm
          initial={{ ...editing, occurredAt: editing.startAt }}
          onSubmit={submit}
        />
      )}
      {editing?.type === 'nap' && (
        <NapEditForm
          initial={editing}
          onSubmit={submit}
        />
      )}
      {editing?.type === 'temperature' && (
        <TemperatureForm
          initial={{ ...editing, occurredAt: editing.startAt }}
          onSubmit={submit}
        />
      )}
      {/* Une condition à DEUX termes, un seul form : les deux types de soin partagent la
          ressource `medical_care` (K1). Le form dérive de `editing.type` le libellé affiché ; le
          type lui-même n'est pas modifiable ici, donc il ne part pas dans le PATCH. */}
      {(editing?.type === 'eye_care' || editing?.type === 'nose_care') && (
        <MedicalCareForm
          initial={{ ...editing, occurredAt: editing.startAt }}
          onSubmit={submit}
        />
      )}
    </BottomSheet>
  )
}

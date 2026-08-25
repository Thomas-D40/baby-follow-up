package com.suivibaby.model;

// Presentation enum of the recap: one value per event type the timeline renders.
// Medical cares are deliberately TWO values (eye_care / nose_care) rather than a single
// `medical_care` (D15-F′ / K1): the front keys its filter toggles, tags, emojis, labels and delete
// clients on `type` alone. A single value would (1) make both filter toggles hide nothing, and
// (2) make EVENT_TYPE_LABEL[editing.type] undefined on the first edit of a care row, tearing down
// the whole CalendarPanel. The stored table stays `medical_care` typed by `care_type`; only the
// calendar-side representation is split (CalendarMapper.fromMedicalCare is the single translation
// point).
public enum CalendarEventType {
    bottle_feeding,
    nap,
    stool,
    urine,
    temperature,
    eye_care,
    nose_care
}

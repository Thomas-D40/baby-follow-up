// One tidying rule shared by every free-text label (dish, medication name, dosage), mirrored by the
// server's TextLabels.tidy: edges stripped, repeated blanks collapsed, case and accents kept.
export function tidyLabel(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

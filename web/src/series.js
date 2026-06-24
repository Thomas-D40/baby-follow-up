// Logique pure de la vue « tendances » (calendrier élargi), extraite pour test unitaire (comme
// calendar.js). Une « vue » (semaine/mois/année) se traduit en une plage de dates calendaires
// [from, to] et une granularité de bucket envoyées au serveur, qui les interprète en Europe/Paris.
//
// Toute l'arithmétique de dates se fait en UTC pur sur des YYYY-MM-DD (jamais le fuseau du device),
// pour rester cohérent avec le bucketing serveur (Paris) — même principe que calendar.js (D6-D).

export const VIEWS = ['week', 'month', 'year']
export const VIEW_LABEL = { week: 'Semaine', month: 'Mois', year: 'Année' }

function ymdToUTC(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function utcToYmd(dt) {
  return dt.toISOString().slice(0, 10)
}

/** Lundi (début de semaine ISO) de la semaine contenant `ymd`. */
function mondayOf(ymd) {
  const dt = ymdToUTC(ymd)
  const offset = (dt.getUTCDay() + 6) % 7 // 0 = lundi … 6 = dimanche
  dt.setUTCDate(dt.getUTCDate() - offset)
  return utcToYmd(dt)
}

/**
 * Plage de dates [from, to] (incluses) et granularité de bucket pour une vue ancrée sur `anchorYmd` :
 * - semaine → lundi→dimanche, buckets jour (7 points) ;
 * - mois → 1er→dernier jour du mois, buckets jour (~28-31 points) ;
 * - année → 1er janv.→31 déc., buckets mois (12 points).
 */
export function periodRange(view, anchorYmd) {
  if (view === 'week') {
    const from = mondayOf(anchorYmd)
    const end = ymdToUTC(from)
    end.setUTCDate(end.getUTCDate() + 6)
    return { from, to: utcToYmd(end), bucket: 'day' }
  }
  const dt = ymdToUTC(anchorYmd)
  const y = dt.getUTCFullYear()
  if (view === 'month') {
    const m = dt.getUTCMonth()
    const from = utcToYmd(new Date(Date.UTC(y, m, 1)))
    const to = utcToYmd(new Date(Date.UTC(y, m + 1, 0))) // jour 0 du mois suivant = dernier jour du mois
    return { from, to, bucket: 'day' }
  }
  return { from: `${y}-01-01`, to: `${y}-12-31`, bucket: 'month' }
}

/** Décale l'ancre d'une vue de `delta` périodes (semaine/mois/année), sans débordement de jour. */
export function shiftPeriod(view, anchorYmd, delta) {
  const dt = ymdToUTC(anchorYmd)
  if (view === 'week') {
    dt.setUTCDate(dt.getUTCDate() + 7 * delta)
  } else if (view === 'month') {
    dt.setUTCDate(1) // ancrer au 1er évite Mars 31 +1 mois → Mai
    dt.setUTCMonth(dt.getUTCMonth() + delta)
  } else {
    dt.setUTCMonth(0, 1)
    dt.setUTCFullYear(dt.getUTCFullYear() + delta)
  }
  return utcToYmd(dt)
}

/** Deux ancres tombent-elles dans la même période (pour le bouton « aujourd'hui ») ? */
export function samePeriod(view, a, b) {
  return periodRange(view, a).from === periodRange(view, b).from
}

/** Libellé de la période courante (« Semaine du 15 juin », « juin 2026 », « 2026 »). */
export function formatPeriodLabel(view, anchorYmd) {
  const { from } = periodRange(view, anchorYmd)
  const fromDt = ymdToUTC(from)
  if (view === 'week') {
    return `Semaine du ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(fromDt)}`
  }
  if (view === 'month') {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(fromDt)
  }
  return String(fromDt.getUTCFullYear())
}

/** Libellé court d'un point sur l'axe X : jour « 15/06 » (buckets jour/semaine) ou mois « janv. ». */
export function formatPointLabel(dateYmd, bucket) {
  const dt = ymdToUTC(dateYmd)
  if (bucket === 'month') {
    return new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(dt)
  }
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(dt)
}

/**
 * Les 4 courbes affichées. `value` extrait la valeur traçable d'un point de série (le sommeil est
 * converti en heures pour rester lisible), `format` produit le texte du tooltip.
 */
export const TREND_METRICS = [
  { key: 'bottleCount', label: 'Biberons', emoji: '🍼', color: 'var(--milk-ink)',
    value: (p) => p.bottleCount, format: (v) => `${v} biberon${v > 1 ? 's' : ''}` },
  { key: 'totalMilkMl', label: 'Lait', emoji: '🍼', color: 'var(--milk)',
    value: (p) => p.totalMilkMl, format: (v) => `${v} ml` },
  { key: 'sleepHours', label: 'Sommeil', emoji: '😴', color: 'var(--sleep)',
    value: (p) => Math.round((p.totalSleepMinutes / 60) * 10) / 10, format: (v) => `${v} h` },
  { key: 'stoolCount', label: 'Selles', emoji: '💩', color: 'var(--stool)',
    value: (p) => p.stoolCount, format: (v) => `${v} selle${v > 1 ? 's' : ''}` },
]

/** Transforme les points de série en lignes prêtes pour Recharts (libellé X + une clé par courbe). */
export function toChartRows(points, bucket) {
  return points.map((p) => {
    const row = { label: formatPointLabel(p.date, bucket) }
    for (const m of TREND_METRICS) row[m.key] = m.value(p)
    return row
  })
}

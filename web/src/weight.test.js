import { describe, it, expect } from 'vitest'
import { ageInMonths, toChartPoints, growthWindow } from './weight'
import { bandGrams, buildGrowthData, WHO_BANDS } from './growth/whoBands'

// Quantiles normaux des percentiles OMS tracés (mêmes Z que WHO_BANDS).
const Z_P3 = -1.88079
const Z_P50 = 0
const Z_P97 = 1.88079

// Valeurs OMS publiées (kg) : garçons/filles à des âges connus. Tolérance ±0,06 kg (tables au pas 0,1 kg).
const TOL_KG = 0.06
const kg = (grams) => grams / 1000

describe('whoBands — garde-fou GOLDEN OMS (P3/P50/P97 = tables publiées, ±0,06 kg)', () => {
  const GOLDEN = {
    male: {
      0: [2.5, 3.3, 4.3],
      12: [7.8, 9.6, 11.8],
      24: [9.8, 12.2, 15.1],
      60: [14.3, 18.3, 23.8],
    },
    female: {
      0: [2.4, 3.2, 4.2],
      12: [7.1, 8.9, 11.3],
      24: [9.2, 11.5, 14.6],
      60: [14.0, 18.2, 24.4],
    },
  }

  for (const sex of ['male', 'female']) {
    for (const month of [0, 12, 24, 60]) {
      const [p3, p50, p97] = GOLDEN[sex][month]
      it(`${sex} m=${month} : P3≈${p3} / P50≈${p50} / P97≈${p97}`, () => {
        expect(kg(bandGrams(sex, month, Z_P3))).toBeCloseTo(p3, 1)
        expect(kg(bandGrams(sex, month, Z_P3))).toBeGreaterThan(p3 - TOL_KG)
        expect(kg(bandGrams(sex, month, Z_P3))).toBeLessThan(p3 + TOL_KG)
        expect(kg(bandGrams(sex, month, Z_P50))).toBeGreaterThan(p50 - TOL_KG)
        expect(kg(bandGrams(sex, month, Z_P50))).toBeLessThan(p50 + TOL_KG)
        expect(kg(bandGrams(sex, month, Z_P97))).toBeGreaterThan(p97 - TOL_KG)
        expect(kg(bandGrams(sex, month, Z_P97))).toBeLessThan(p97 + TOL_KG)
      })
    }
  }

  it('tables sexuées bien distinctes : garçon ≠ fille au même âge (P50 à 12 mois)', () => {
    const boy = bandGrams('male', 12, Z_P50)
    const girl = bandGrams('female', 12, Z_P50)
    expect(boy).not.toBe(girl)
    expect(boy).toBeGreaterThan(girl) // garçons plus lourds à 12 mois (9,6 vs 8,9 kg)
  })

  it('interpolation entre deux mois : P50 à 12,5 mois tombe entre m=12 et m=13', () => {
    const at12 = bandGrams('male', 12, Z_P50)
    const at13 = bandGrams('male', 13, Z_P50)
    const at125 = bandGrams('male', 12.5, Z_P50)
    const lo = Math.min(at12, at13)
    const hi = Math.max(at12, at13)
    expect(at125).toBeGreaterThan(lo)
    expect(at125).toBeLessThan(hi)
  })

  it('âge > 60 mois → pas de bande (le moteur n\'extrapole pas)', () => {
    expect(bandGrams('male', 61, Z_P50)).toBeNull()
    expect(bandGrams('female', 72, Z_P50)).toBeNull()
    // La borne exacte 60 est encore couverte.
    expect(bandGrams('male', 60, Z_P50)).not.toBeNull()
  })

  it('WHO_BANDS expose exactement les 5 bandes attendues avec P50 centrée (z=0)', () => {
    expect(WHO_BANDS.map((b) => b.key)).toEqual(['p3', 'p15', 'p50', 'p85', 'p97'])
    expect(WHO_BANDS.find((b) => b.key === 'p50').z).toBe(0)
  })
})

describe('ageInMonths — âge en mois depuis la naissance', () => {
  it('naissance = 0', () => {
    expect(ageInMonths('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('1 an plus tard ≈ 12 mois', () => {
    expect(ageInMonths('2027-01-01', '2026-01-01')).toBeCloseTo(12, 1)
  })

  it('âge fractionnaire : ~3 semaines (21 j) tombe entre 0 et 1 mois', () => {
    const age = ageInMonths('2026-01-22', '2026-01-01') // 21 jours
    expect(age).toBeGreaterThan(0)
    expect(age).toBeLessThan(1)
    expect(age).toBeCloseTo(21 / (365.25 / 12), 3)
  })

  it('dates manquantes → null (le gate garantit birthDate côté vue)', () => {
    expect(ageInMonths(null, '2026-01-01')).toBeNull()
    expect(ageInMonths('2026-01-01', null)).toBeNull()
  })
})

describe('toChartPoints — historique → points sur l\'axe âge', () => {
  it('jour omis (pesées J1 et J3) → 2 points seulement, aucun point intermédiaire/0 (segment direct)', () => {
    const history = {
      points: [
        { givenOn: '2026-01-02', weightGrams: 3400 }, // J1 (naissance = 2026-01-01)
        { givenOn: '2026-01-04', weightGrams: 3600 }, // J3
      ],
    }
    const pts = toChartPoints(history, '2026-01-01')
    expect(pts).toHaveLength(2)
    expect(pts.map((p) => p.weightGrams)).toEqual([3400, 3600])
    // Aucun point à 0 ni intermédiaire injecté : le chart relie J1→J3 en droite.
    expect(pts.some((p) => p.weightGrams === 0)).toBe(false)
    // Placés à leur âge réel (proportionnel au temps), pas à des index équidistants.
    expect(pts[0].ageMonths).toBeCloseTo(1 / (365.25 / 12), 3)
    expect(pts[1].ageMonths).toBeCloseTo(3 / (365.25 / 12), 3)
  })

  it('trie par âge croissant et écarte les pesées antérieures à la naissance', () => {
    const history = {
      points: [
        { givenOn: '2026-03-01', weightGrams: 5000 },
        { givenOn: '2025-12-01', weightGrams: 9999 }, // avant naissance → écarté
        { givenOn: '2026-01-01', weightGrams: 3300 },
      ],
    }
    const pts = toChartPoints(history, '2026-01-01')
    expect(pts.map((p) => p.weightGrams)).toEqual([3300, 5000])
  })

  it('historique vide / absent → aucun point (pas de crash)', () => {
    expect(toChartPoints(undefined, '2026-01-01')).toEqual([])
    expect(toChartPoints({ points: [] }, '2026-01-01')).toEqual([])
  })
})

describe('growthWindow — fenêtre d\'âge Tout / Année / Mois (D12-I′)', () => {
  const birth = '2025-01-01'
  const today = '2026-08-12' // ~19,4 mois

  it('Tout : de la naissance (0) à l\'âge courant', () => {
    const { minMonths, maxMonths } = growthWindow('all', birth, 0, today)
    expect(minMonths).toBe(0)
    expect(maxMonths).toBeCloseTo(ageInMonths(today, birth), 5)
  })

  it('Année : les 12 derniers mois d\'âge', () => {
    const { minMonths, maxMonths } = growthWindow('year', birth, 0, today)
    expect(maxMonths - minMonths).toBeCloseTo(12, 5)
  })

  it('Mois : le dernier mois d\'âge (~30 j)', () => {
    const { minMonths, maxMonths } = growthWindow('month', birth, 0, today)
    expect(maxMonths - minMonths).toBeCloseTo(1, 5)
  })

  it('borne le max sur la dernière pesée pour qu\'un point futur reste visible', () => {
    // latest (24 mois) > âge courant (~19,4) → maxMonths suit latest.
    const { maxMonths } = growthWindow('all', birth, 24, today)
    expect(maxMonths).toBeCloseTo(24, 5)
  })
})

describe('buildGrowthData — fusion bandes OMS + points enfant sur l\'axe âge', () => {
  it('porte les 5 bandes du bon sexe et place le poids de l\'enfant à son âge exact', () => {
    const childPoints = [{ ageMonths: 12, weightGrams: 9600 }]
    const rows = buildGrowthData('male', childPoints, { minMonths: 0, maxMonths: 12 })
    const at12 = rows.find((r) => r.ageMonths === 12)
    expect(at12.child).toBe(9600)
    for (const band of WHO_BANDS) {
      expect(at12[band.key]).toBeGreaterThan(0)
    }
    // Bandes du bon sexe : la P50 à 12 mois vaut la valeur garçon, pas fille.
    expect(at12.p50).toBe(bandGrams('male', 12, 0))
  })

  it('âges > 60 mois : bandes null (points enfant tracés seuls sur ce segment)', () => {
    const childPoints = [{ ageMonths: 64, weightGrams: 20000 }]
    const rows = buildGrowthData('male', childPoints, { minMonths: 60, maxMonths: 64 })
    const at64 = rows.find((r) => r.ageMonths === 64)
    expect(at64.child).toBe(20000)
    expect(at64.p50).toBeNull()
  })
})

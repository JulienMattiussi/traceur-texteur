import { describe, expect, it } from 'vitest'
import { COURIER, HELVETICA, TIMES } from '@/lib/fonts'
import {
  advanceOf,
  bandHeight,
  baselineOffset,
  cssFontFamily,
  metricsFor,
  sizeForBand,
  toChars,
} from '@/lib/metrics'

const FAMILIES = [HELVETICA, TIMES, COURIER]

describe('la table de métriques', () => {
  it('reprend les largeurs Adobe de Helvetica', () => {
    // Valeurs de référence de l'AFM Adobe : si la génération dérive, elles
    // bougent, et tout le placement avec.
    expect(HELVETICA.widths[32]).toBe(278)
    expect(HELVETICA.widths[65]).toBe(667)
    expect(HELVETICA.widths[87]).toBe(944)
    expect(HELVETICA.widths[105]).toBe(222)
  })

  it('donne à Courier la même largeur pour tous ses glyphes', () => {
    const widths = new Set(Object.values(COURIER.widths))
    expect(widths).toEqual(new Set([600]))
  })

  it('couvre tout l’ASCII imprimable et les accents du français', () => {
    for (const font of FAMILIES) {
      for (let code = 32; code <= 126; code++) {
        expect(font.widths[code], `code ${code}`).toBeGreaterThan(0)
      }
      for (const char of 'àâçéèêëîïôöùûüÿœŒæÆ«»…–—€') {
        expect(font.widths[char.codePointAt(0)!], char).toBeGreaterThan(0)
      }
    }
  })

  it('a une bande d’encre qui encadre la ligne de base', () => {
    for (const font of FAMILIES) {
      expect(font.ascent).toBeGreaterThan(font.capHeight)
      expect(font.descent).toBeLessThan(0)
    }
  })
})

describe('metricsFor', () => {
  it('associe chaque famille à sa table et à une pile CSS cohérente', () => {
    expect(metricsFor('sans')).toBe(HELVETICA)
    expect(metricsFor('serif')).toBe(TIMES)
    expect(metricsFor('mono')).toBe(COURIER)
    // Le premier nom de la pile doit être celui dont on utilise les largeurs.
    expect(cssFontFamily('sans')).toMatch(/^Helvetica/)
    expect(cssFontFamily('serif')).toMatch(/^Times/)
    expect(cssFontFamily('mono')).toMatch(/^Courier/)
  })
})

describe('advanceOf', () => {
  it('est proportionnelle au corps', () => {
    expect(advanceOf(HELVETICA, 'A', 10)).toBeCloseTo(6.67, 6)
    expect(advanceOf(HELVETICA, 'A', 20)).toBeCloseTo(13.34, 6)
  })

  it('retombe sur la largeur de repli hors de la table', () => {
    // Jamais zéro : une avance nulle empêcherait la pose du texte de progresser
    // le long du tracé, donc bouclerait sans fin.
    expect(advanceOf(HELVETICA, '中', 10)).toBeCloseTo((HELVETICA.fallback * 10) / 1000, 6)
    expect(advanceOf(HELVETICA, '中', 10)).toBeGreaterThan(0)
  })
})

describe('bandHeight et sizeForBand', () => {
  it('sont réciproques', () => {
    for (const font of FAMILIES) {
      for (const size of [1, 7.5, 40]) {
        expect(sizeForBand(font, bandHeight(font, size))).toBeCloseTo(size, 9)
      }
    }
  })

  it('donne une bande plus haute que le corps, accents des capitales obligent', () => {
    expect(bandHeight(HELVETICA, 10)).toBeGreaterThan(10)
  })
})

describe('baselineOffset', () => {
  it('place le milieu de la bande d’encre exactement sur le tracé', () => {
    // C'est l'invariant dont dépend tout le calcul de place libre : la bande
    // déborde du tracé de sa demi-hauteur de chaque côté, pas plus d'un côté que
    // de l'autre.
    for (const font of FAMILIES) {
      const size = 12
      const offset = baselineOffset(font, size)
      // Sommet de l'encre et bas de l'encre, comptés depuis le tracé.
      const above = (font.ascent * size) / 1000 - offset
      const below = offset - (font.descent * size) / 1000
      expect(above).toBeCloseTo(below, 9)
      expect(above + below).toBeCloseTo(bandHeight(font, size), 9)
    }
  })
})

describe('toChars', () => {
  it('itère par point de code, pas par unité UTF-16', () => {
    expect(toChars('abc')).toEqual(['a', 'b', 'c'])
    // Découpé par unité de code, cet emoji donnerait deux caractères de
    // remplacement au lieu d'un glyphe.
    expect(toChars('a\u{1f600}b')).toEqual(['a', '\u{1f600}', 'b'])
  })
})

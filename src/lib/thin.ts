import type { Mask } from '@/lib/types'

/**
 * Squelettisation de Zhang-Suen : amincit chaque trait jusqu'à 1 pixel
 * d'épaisseur en préservant la topologie (aucun trait n'est coupé, aucune
 * boucle n'est ouverte).
 *
 * C'est l'étape qui rend le tracé intérieur exploitable : un contour de
 * coloriage épais de 6 px devient une courbe unique, au lieu des deux bords
 * parallèles que renverrait une détection de contours classique.
 */
export function thin(mask: Mask): Mask {
  const { width, height } = mask
  const data = Uint8Array.from(mask.data)

  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0
    return data[y * width + x]!
  }

  const doomed: number[] = []
  let changed = true

  while (changed) {
    changed = false

    for (let step = 0; step < 2; step++) {
      doomed.length = 0

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!data[y * width + x]) continue

          // Voisins numérotés dans le sens horaire depuis le nord (p2..p9).
          const p2 = at(x, y - 1)
          const p3 = at(x + 1, y - 1)
          const p4 = at(x + 1, y)
          const p5 = at(x + 1, y + 1)
          const p6 = at(x, y + 1)
          const p7 = at(x - 1, y + 1)
          const p8 = at(x - 1, y)
          const p9 = at(x - 1, y - 1)

          // B : nombre de voisins encrés. Hors [2,6] on est sur une extrémité
          // (à garder) ou dans une zone pleine (pas encore amincie).
          const filled = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (filled < 2 || filled > 6) continue

          // A : nombre de transitions 0 -> 1 sur le tour. A != 1 signifie que
          // retirer ce pixel déconnecterait le trait.
          const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
          let transitions = 0
          for (let i = 0; i < 8; i++) {
            if (ring[i] === 0 && ring[i + 1] === 1) transitions++
          }
          if (transitions !== 1) continue

          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue
          } else {
            if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue
          }

          doomed.push(y * width + x)
        }
      }

      if (doomed.length > 0) {
        changed = true
        for (const p of doomed) data[p] = 0
      }
    }
  }

  return { width, height, data }
}

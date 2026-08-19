import { flowText, type FlowOptions, type FlowResult } from '@/lib/flow'
import type { SizeField } from '@/lib/sizing'
import type { Ribbon } from '@/lib/types'

/**
 * Mode « une seule fois » : faire tomber la fin du texte sur la fin du tracé.
 *
 * Le champ de tailles donne le plus grand corps qui ne chevauche rien ; on ne
 * peut donc que réduire, jamais grossir. On cherche par dichotomie la plus
 * grande réduction qui laisse encore le texte entier tenir. Deux issues
 * possibles, et les deux sont honnêtes :
 *
 * - le texte est trop long : il rentre réduit, et remplit tout le tracé ;
 * - le texte est trop court : même à pleine taille il n'atteint pas la fin, et
 *   `coverage` le dit plutôt que de faire semblant.
 */

/** Assez d'itérations pour que la taille retenue ne bouge plus au millième près. */
const ITERATIONS = 20

export function fitOnce(
  ribbons: Ribbon[],
  fields: SizeField[],
  options: Omit<FlowOptions, 'repeat' | 'scale'>,
): FlowResult {
  const run = (scale: number): FlowResult =>
    flowText(ribbons, fields, { ...options, repeat: false, scale })

  const full = run(1)
  // À pleine taille le texte tient déjà : rien à réduire, il restera du tracé nu.
  if (!full.truncated) return full

  let low = 0
  let high = 1

  for (let i = 0; i < ITERATIONS; i++) {
    const middle = (low + high) / 2
    if (run(middle).truncated) high = middle
    else low = middle
  }

  return run(low)
}

/**
 * Rastérisation du SVG en PNG, pour partager l'image ailleurs qu'à l'impression.
 *
 * Le navigateur fait tout le travail : on lui donne le SVG comme source d'image
 * et il le rend avec ses propres polices. C'est justement pour que ce rendu
 * coïncide avec le PDF que le projet s'en tient aux trois familles de base, dont
 * les clones installés partout ont les mêmes largeurs (voir `metrics.ts`).
 */

/**
 * Facteur d'échelle par défaut. Le SVG est dimensionné en pixels de travail, à
 * quatre par millimètre, soit une centaine de points par pouce : trop peu pour
 * une image partagée, d'où le doublement.
 */
const DEFAULT_SCALE = 2

export async function rasterize(svg: string, scale = DEFAULT_SCALE): Promise<Blob> {
  // Un blob plutôt qu'une URL de données : celle-ci passe par un encodage base64
  // du document entier, et un texte de plusieurs milliers de glyphes y devient
  // une chaîne de plusieurs mégaoctets.
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))

  try {
    const image = await load(url)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Le canvas 2D est indisponible dans ce navigateur.')

    // Le SVG n'a pas de fond quand il est destiné à la surimpression ; un PNG
    // partagé, lui, doit être opaque, sinon il s'affiche noir sur les messageries
    // en thème sombre.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    return await toBlob(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Le rendu du SVG a échoué.'))
    image.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('La conversion en PNG a échoué.'))
    }, 'image/png')
  })
}

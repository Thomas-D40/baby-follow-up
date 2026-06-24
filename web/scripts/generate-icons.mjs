// Génère les icônes PWA (PNG) à partir du motif vectoriel « biberon » du design-system.
// Usage : depuis web/ → `npm install --no-save sharp && node scripts/generate-icons.mjs`
// Les PNG produits sont des assets statiques commités dans public/ ; sharp n'est PAS une
// dépendance du projet (la CI n'en a pas besoin).
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// Pastille corail (couleur d'action de l'app) + biberon blanc, goutte de lait, graduations.
const bottle = `
  <path d="M256 120 c-22 0 -34 16 -34 34 c0 9 7 16 16 16 h36 c9 0 16 -7 16 -16 c0 -18 -12 -34 -34 -34 z" fill="#ffe1d6"/>
  <rect x="210" y="166" width="92" height="44" rx="14" fill="#ffffff"/>
  <rect x="181" y="200" width="150" height="230" rx="52" fill="#ffffff"/>
  <clipPath id="body"><rect x="181" y="200" width="150" height="230" rx="52"/></clipPath>
  <g clip-path="url(#body)"><rect x="181" y="300" width="150" height="130" fill="#fcdfd6"/></g>
  <g stroke="#ee9483" stroke-width="10" stroke-linecap="round">
    <line x1="205" y1="250" x2="233" y2="250"/>
    <line x1="205" y1="282" x2="225" y2="282"/>
    <line x1="205" y1="314" x2="233" y2="314"/>
  </g>`

// Variante « any » : pastille à coins arrondis (usage navigateur / favicon).
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="116" fill="#ec8675"/>${bottle}
</svg>`

// Variante « maskable » : fond pleine page, motif réduit dans la zone de sécurité (80 %),
// pour que l'OS Android le recadre (cercle/squircle) sans rogner le biberon.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#ec8675"/>
  <g transform="translate(51.2,51.2) scale(0.8)">${bottle}</g>
</svg>`

async function render(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(publicDir, out))
  console.log('✓', out, `(${size}×${size})`)
}

await render(rounded, 192, 'icon-192.png')
await render(rounded, 512, 'icon-512.png')
await render(maskable, 512, 'icon-512-maskable.png')
await render(maskable, 180, 'apple-touch-icon.png')
console.log('Icônes générées dans', publicDir)

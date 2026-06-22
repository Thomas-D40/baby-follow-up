import { useEffect } from 'react'

/**
 * Feuille modale ancrée en bas (idiome mobile). Ouvre une surface arrondie qui glisse depuis le bas
 * de l'écran ; sert de conteneur aux saisies rapides (biberon / sieste / selle) déclenchées par la
 * barre d'actions de la fiche bébé. Ses enfants ne sont montés que pendant l'ouverture (`open`), donc
 * les requêtes des panels ne partent qu'à l'ouverture de la feuille correspondante.
 *
 * Fermeture : bouton ×, clic sur l'overlay, ou touche Échap. `title` accepte du JSX (emoji + libellé).
 */
export default function BottomSheet({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button className="sheet-close" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

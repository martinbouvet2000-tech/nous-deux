import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { demarrerMisesAJour } from './lib/majAuto'

// Doit partir avant le rendu : c'est ce qui garde l'app à jour sur les
// téléphones où elle n'est jamais vraiment fermée.
demarrerMisesAJour()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

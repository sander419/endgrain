import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { WorkshopProvider } from './WorkshopContext'

// Профиль и лицензия живут выше App: их читают и шапка, и студия мозаики,
// и печатные листы — то есть обе ветки дерева сразу.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkshopProvider>
      <App />
    </WorkshopProvider>
  </StrictMode>,
)

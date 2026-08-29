import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('No se encontro #root');

// Cuando el user tiene el index.html cacheado y hacemos un nuevo deploy,
// los chunks lazy con hash viejo dejan de existir en el servidor. El fetch
// dinamico falla con "Failed to fetch dynamically imported module".
// Detectamos ese error y recargamos la pagina (solo una vez para evitar loops).
function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('failed to import') ||
    msg.includes('importing a module script failed') ||
    msg.includes('unable to preload css') ||
    msg.includes('chunkloaderror')
  );
}

const RELOAD_FLAG = 'sh-chunk-reload';

function safeReload(): void {
  if (sessionStorage.getItem(RELOAD_FLAG)) return; // ya recargamos una vez
  sessionStorage.setItem(RELOAD_FLAG, '1');
  window.location.reload();
}

window.addEventListener('error', (e) => {
  if (isChunkLoadError(e.error) || isChunkLoadError(e.message)) safeReload();
});

window.addEventListener('unhandledrejection', (e) => {
  if (isChunkLoadError(e.reason)) safeReload();
});

// Al montar OK, limpiar el flag (asi si vuelve a haber un deploy nuevo funciona)
setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 5_000);

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

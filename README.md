# Vale USD v3

Cambios:
- Sesión persistente en localStorage.
- Cierre de período real.
- Pagos pendientes separados de histórico.
- Al cerrar, el Apps Script marca pagos como cerrado=true y les asigna cierre_id.
- Selector de fecha para pagos.
- CACHE_NAME: vale-usd-v3.

## Pasos
1. Pegar `apps_script_v3.js` en Apps Script.
2. Guardar.
3. Implementar → Nueva implementación → Aplicación web.
4. Subir `index.html`, `manifest.json`, `sw.js`, `icon.svg` al repo.
5. Refrescar la app instalada.

Apps Script URL configurada:
https://script.google.com/macros/s/AKfycbw6YsONTUWXMKU7SXQA0DJaSjoMCdXS-HJImfXMzw1M1Ord5GMH1ALKcPkNFz4CDBl7/exec

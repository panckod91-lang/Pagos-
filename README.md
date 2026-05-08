# Panckobros! v6.0 WhatsApp only fix

Base: panckobros_v6_rebrand.zip, que enviaba correctamente.
Cambio único:
- buildPagoWhatsappMessage usa saltos reales de línea con String.fromCharCode(10).
- Mensaje WhatsApp más limpio.

No se tocó:
- login
- addPago
- sendPagoWhatsapp
- Apps Script

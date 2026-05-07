const SHEET_ID = "1guzz7-tYohOUxR4i628WesCUrcOBAo_6EcojFOHdS64";

function doGet(e) {
  const action = e.parameter.action || "bootstrap";

  if (action === "bootstrap") {
    ensureStructure();
    return jsonResponse({
      ok: true,
      data: getBootstrap()
    });
  }

  return jsonResponse({ ok: false, error: "Acción no válida" });
}

function doPost(e) {
  try {
    ensureStructure();

    const body = JSON.parse(e.postData.contents || "{}");
    const action = body.action;

    if (action === "addPago") return jsonResponse(addPago(body));
    if (action === "addCierre") return jsonResponse(addCierre(body));

    return jsonResponse({ ok: false, error: "Acción POST no válida" });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function getBootstrap() {
  return {
    config: readSheet("config"),
    pagos: readSheet("pagos"),
    cierres: readSheet("cierres")
  };
}

function addPago(body) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName("pagos");

  sh.appendRow([
    body.id || newId(),
    body.fecha || new Date().toISOString(),
    Number(body.monto_ars || 0),
    body.nota || "",
    body.creado_por || "Tincho",
    false,
    ""
  ]);

  return { ok: true, message: "Pago registrado" };
}

function addCierre(body) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const pagosSh = ss.getSheetByName("pagos");
  const cierresSh = ss.getSheetByName("cierres");

  const cierreId = body.id || newId();
  const cotizacion = Number(body.cotizacion || 0);

  if (!cotizacion || cotizacion <= 0) {
    return { ok: false, error: "Cotización inválida" };
  }

  const pagosData = getObjectsWithRow("pagos");
  const pendientes = pagosData.filter(p => !isTrue(p.cerrado));

  if (!pendientes.length) {
    return { ok: false, error: "No hay pagos pendientes para cerrar" };
  }

  const arsTotal = pendientes.reduce((acc, p) => acc + Number(p.monto_ars || 0), 0);
  const usdPagado = arsTotal / cotizacion;

  cierresSh.appendRow([
    cierreId,
    body.periodo || nextPeriodoLabel(),
    body.fecha_cierre || new Date().toISOString(),
    arsTotal,
    cotizacion,
    usdPagado,
    pendientes.length
  ]);

  const headers = pagosSh.getRange(1, 1, 1, pagosSh.getLastColumn()).getValues()[0];
  const cerradoCol = headers.indexOf("cerrado") + 1;
  const cierreIdCol = headers.indexOf("cierre_id") + 1;

  pendientes.forEach(p => {
    pagosSh.getRange(p.__row, cerradoCol).setValue(true);
    pagosSh.getRange(p.__row, cierreIdCol).setValue(cierreId);
  });

  return {
    ok: true,
    message: "Cierre registrado",
    cierre_id: cierreId,
    ars_total: arsTotal,
    usd_pagado: usdPagado,
    pagos_cerrados: pendientes.length
  };
}

function readSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(name);
  const values = sh.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0];

  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function getObjectsWithRow(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(name);
  const values = sh.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0];

  return values.slice(1).map((row, index) => {
    const obj = { __row: index + 2 };
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  }).filter(obj => Object.values(obj).some(v => String(v || "").trim() !== ""));
}

function ensureStructure() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  ensureSheet(ss, "config", ["clave", "valor"], [
    ["deuda_usd", "2000"],
    ["admin_pin", "1234"],
    ["viewer_pin", "0000"],
    ["nombre_admin", "Tincho"],
    ["nombre_viewer", "Vale"]
  ]);

  ensureSheet(ss, "pagos", ["id", "fecha", "monto_ars", "nota", "creado_por", "cerrado", "cierre_id"], []);
  ensureSheet(ss, "cierres", ["id", "periodo", "fecha_cierre", "ars_total", "cotizacion", "usd_pagado", "cantidad_pagos"], []);

  migrateHeaders("pagos", ["id", "fecha", "monto_ars", "nota", "creado_por", "cerrado", "cierre_id"]);
  migrateHeaders("cierres", ["id", "periodo", "fecha_cierre", "ars_total", "cotizacion", "usd_pagado", "cantidad_pagos"]);

  migrateOldCierres();
}

function ensureSheet(ss, name, headers, starterRows) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0 || !sh.getRange(1, 1).getValue()) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (starterRows && starterRows.length) {
      sh.getRange(2, 1, starterRows.length, starterRows[0].length).setValues(starterRows);
    }
  }
}

function migrateHeaders(name, wantedHeaders) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(name);
  const lastCol = Math.max(sh.getLastColumn(), 1);
  let headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  wantedHeaders.forEach(h => {
    if (!headers.includes(h)) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(h);
      headers.push(h);
    }
  });

  // Compatibilidad: si cierres vieja tenía "semana", la copiamos como "periodo"
  if (name === "cierres") {
    headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const semanaCol = headers.indexOf("semana") + 1;
    const periodoCol = headers.indexOf("periodo") + 1;

    if (semanaCol > 0 && periodoCol > 0 && sh.getLastRow() > 1) {
      const values = sh.getRange(2, periodoCol, sh.getLastRow() - 1, 1).getValues();
      const semanas = sh.getRange(2, semanaCol, sh.getLastRow() - 1, 1).getValues();

      const merged = values.map((row, i) => [row[0] || semanas[i][0] || "Período"]);
      sh.getRange(2, periodoCol, merged.length, 1).setValues(merged);
    }
  }
}

function migrateOldCierres() {
  // Si ya existía un cierre viejo sin cierre_id en pagos, marcamos pagos antiguos como cerrados
  // para que no vuelvan a aparecer como pendientes.
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const pagosSh = ss.getSheetByName("pagos");
  const cierresSh = ss.getSheetByName("cierres");

  if (pagosSh.getLastRow() < 2 || cierresSh.getLastRow() < 2) return;

  const pagosHeaders = pagosSh.getRange(1, 1, 1, pagosSh.getLastColumn()).getValues()[0];
  const cerradoCol = pagosHeaders.indexOf("cerrado") + 1;
  const cierreIdCol = pagosHeaders.indexOf("cierre_id") + 1;

  const pagos = getObjectsWithRow("pagos");
  const alreadyMarked = pagos.some(p => isTrue(p.cerrado) || String(p.cierre_id || "").trim());

  if (alreadyMarked) return;

  const firstCierre = readSheet("cierres")[0];
  const oldCierreId = firstCierre.id || "cierre_migrado";
  const arsCerrado = Number(firstCierre.ars_total || 0);
  let acumulado = 0;

  for (let p of pagos) {
    if (acumulado < arsCerrado) {
      acumulado += Number(p.monto_ars || 0);
      pagosSh.getRange(p.__row, cerradoCol).setValue(true);
      pagosSh.getRange(p.__row, cierreIdCol).setValue(oldCierreId);
    }
  }
}

function nextPeriodoLabel() {
  const cierres = readSheet("cierres");
  return "Período " + String(cierres.length + 1).padStart(2, "0");
}

function isTrue(v) {
  const s = String(v).toLowerCase().trim();
  return v === true || s === "true" || s === "verdadero" || s === "si" || s === "sí" || s === "1";
}

function newId() {
  return "id_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

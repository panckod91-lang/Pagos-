/**
 * =========================================================
 * Panckobros! Backend v7.41
 * "Consolidado Artesanal"
 * =========================================================
 */

const CONFIG = {
  SHEET_ID: "1guzz7-tYohOUxR4i628WesCUrcOBAo_6EcojFOHdS64",
  DEFAULT_CUENTA_ID: "c1",
  TIMEZONE: "America/Argentina/Buenos_Aires",
  VERSION: "v7.41",
  RUN_MIGRATIONS: false
};

function doGet(e) {
  try {
    ensureStructure();
    return jsonResponse({ ok: true, version: CONFIG.VERSION, data: getBootstrap() });
  } catch (err) {
    Logger.log(`[${CONFIG.VERSION}] doGet ERROR: ${err}`);
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    ensureStructure();
    const body = JSON.parse(e.postData.contents || "{}");
    const action = String(body.action || "").trim();
    if (action === "addPago") return jsonResponse(addPago(body));
    if (action === "addCierre") return jsonResponse(addCierre(body));
    return jsonResponse({ ok: false, error: "Acción POST no válida" });
  } catch (err) {
    Logger.log(`[${CONFIG.VERSION}] doPost ERROR: ${err}`);
    return jsonResponse({ ok: false, error: err.message });
  }
}

function getBootstrap() {
  return {
    config: readSheet("config"),
    usuarios: readSheet("usuarios"),
    cuentas: readSheet("cuentas"),
    pagos: readSheet("pagos"),
    cierres: readSheet("cierres")
  };
}

function addPago(body) {
  const cuentaId = body.cuenta_id || CONFIG.DEFAULT_CUENTA_ID;
  const rowObj = {
    id: body.id || newId(),
    cuenta_id: cuentaId,
    fecha: body.fecha || fechaLocal(),
    monto_ars: Number(body.monto_ars || 0),
    nota: body.nota || "",
    creado_por: body.creado_por || "Sistema",
    cerrado: false,
    cierre_id: ""
  };
  appendObjectRow("pagos", rowObj);
  Logger.log(`[${CONFIG.VERSION}] Pago registrado | cuenta=${cuentaId}`);
  return { ok: true, message: "Pago registrado", cuenta_id: cuentaId };
}

function addCierre(body) {
  const ss = openSS();
  const pagosSh = ss.getSheetByName("pagos");
  const cierreId = body.id || newId();
  const cuentaId = body.cuenta_id || CONFIG.DEFAULT_CUENTA_ID;
  const cotizacion = Number(body.cotizacion || 0);

  if (!cotizacion || cotizacion <= 0) return { ok: false, error: "Cotización inválida" };

  const pendientes = getPagosPendientesCuenta(cuentaId);
  if (!pendientes.length) return { ok: false, error: "No hay pagos pendientes" };

  const arsTotal = pendientes.reduce((acc, p) => acc + Number(p.monto_ars || 0), 0);
  const usdPagado = arsTotal / cotizacion;

  appendObjectRow("cierres", {
    id: cierreId,
    cuenta_id: cuentaId,
    periodo: nextPeriodoLabel(cuentaId),
    fecha_cierre: fechaLocal(),
    ars_total: arsTotal,
    cotizacion: cotizacion,
    usd_pagado: usdPagado,
    cantidad_pagos: pendientes.length
  });

  const headers = getHeaders("pagos");
  const cerradoCol = headers.indexOf("cerrado") + 1;
  const cierreIdCol = headers.indexOf("cierre_id") + 1;

  pendientes.forEach(p => {
    pagosSh.getRange(p.__row, cerradoCol).setValue(true);
    pagosSh.getRange(p.__row, cierreIdCol).setValue(cierreId);
  });

  Logger.log(`[${CONFIG.VERSION}] Cierre registrado | cuenta=${cuentaId} | ars=${arsTotal}`);
  return { ok: true, cierre_id: cierreId, ars_total: arsTotal, usd_pagado: usdPagado };
}

function getPagosCuenta(cuentaId) {
  return readSheet("pagos").filter(p =>
    String(p.cuenta_id || CONFIG.DEFAULT_CUENTA_ID) === String(cuentaId)
  );
}

function getCierresCuenta(cuentaId) {
  return readSheet("cierres").filter(c =>
    String(c.cuenta_id || CONFIG.DEFAULT_CUENTA_ID) === String(cuentaId)
  );
}

function getPagosPendientesCuenta(cuentaId) {
  return getObjectsWithRow("pagos").filter(p =>
    String(p.cuenta_id || CONFIG.DEFAULT_CUENTA_ID) === String(cuentaId)
    && !isTrue(p.cerrado)
    && !String(p.cierre_id || "").trim()
  );
}

function nextPeriodoLabel(cuentaId) {
  const cierres = getCierresCuenta(cuentaId);
  if (!cierres.length) return "Período 01";
  const numeros = cierres.map(c => {
    const match = String(c.periodo || "").match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  });
  const maxPeriodo = Math.max(...numeros);
  return "Período " + String(maxPeriodo + 1).padStart(2, "0");
}

function ensureStructure() {
  const ss = openSS();
  const estructura = {
    config: ["clave", "valor"],
    usuarios: ["id","nombre","usuario","pin","rol","telefono","activo","cuenta_id"],
    cuentas: ["id","nombre","tipo","moneda","deuda_total","cantidad_cuotas","valor_cuota","usuario_viewer","activo"],
    pagos: ["id","cuenta_id","fecha","monto_ars","nota","creado_por","cerrado","cierre_id"],
    cierres: ["id","cuenta_id","periodo","fecha_cierre","ars_total","cotizacion","usd_pagado","cantidad_pagos"]
  };

  ensureSheet(ss, "config", estructura.config, [["deuda_usd","2000"]]);
  ensureSheet(ss, "usuarios", estructura.usuarios, []);
  ensureSheet(ss, "cuentas", estructura.cuentas, [[CONFIG.DEFAULT_CUENTA_ID,"Cuenta actual","usd_cierre","USD","2000","","","",true]]);
  ensureSheet(ss, "pagos", estructura.pagos, []);
  ensureSheet(ss, "cierres", estructura.cierres, []);

  Object.keys(estructura).forEach(name => ensureHeaders(ss, name, estructura[name]));

  if (CONFIG.RUN_MIGRATIONS) {
    migrateCuentaId("usuarios");
    migrateCuentaId("pagos");
    migrateCuentaId("cierres");
  }
}

function ensureSheet(ss, name, headers, starterRows) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    Logger.log(`[${CONFIG.VERSION}] Hoja creada: ${name}`);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (starterRows && starterRows.length) {
      sh.getRange(2, 1, starterRows.length, starterRows[0].length).setValues(starterRows);
    }
  }
}

function ensureHeaders(ss, name, wantedHeaders) {
  const sh = ss.getSheetByName(name);
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const currentHeaders = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  wantedHeaders.forEach(header => {
    if (!currentHeaders.includes(header)) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(header);
      Logger.log(`[${CONFIG.VERSION}] Header agregado: ${header} | hoja=${name}`);
    }
  });
}

function migrateCuentaId(sheetName) {
  const sh = openSS().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return;
  const headers = getHeaders(sheetName);
  const cuentaCol = headers.indexOf("cuenta_id") + 1;
  if (!cuentaCol) return;
  const range = sh.getRange(2, cuentaCol, sh.getLastRow() - 1, 1);
  const values = range.getValues();
  const needsMigration = values.some(row => !String(row[0] || "").trim());
  if (!needsMigration) return;
  range.setValues(values.map(row => [row[0] || CONFIG.DEFAULT_CUENTA_ID]));
  Logger.log(`[${CONFIG.VERSION}] Migración cuenta_id ejecutada | hoja=${sheetName}`);
}

function openSS() {
  return SpreadsheetApp.openById(CONFIG.SHEET_ID);
}

function getHeaders(sheetName) {
  const sh = openSS().getSheetByName(sheetName);
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function appendObjectRow(sheetName, rowObj) {
  const sh = openSS().getSheetByName(sheetName);
  const headers = getHeaders(sheetName);
  sh.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ""));
}

function readSheet(name) {
  const sh = openSS().getSheetByName(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => String(cell || "").trim() !== ""))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function getObjectsWithRow(name) {
  const sh = openSS().getSheetByName(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .map((row, i) => {
      const obj = { __row: i + 2 };
      headers.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    })
    .filter(obj => Object.keys(obj).some(k => k !== "__row" && String(obj[k] || "").trim() !== ""));
}

function isTrue(v) {
  if (typeof v === "boolean") return v;
  return ["true","verdadero","si","sí","1"].includes(String(v).toLowerCase().trim());
}

function fechaLocal() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
}

function newId() {
  return "id_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

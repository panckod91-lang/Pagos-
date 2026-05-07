const SHEET_ID = "1guzz7-tYohOUxR4i628WesCUrcOBAo_6EcojFOHdS64";

const HEADERS = {
  config: ["clave", "valor"],
  pagos: ["id", "fecha", "fecha_registro", "monto_ars", "nota", "creado_por"],
  cierres: ["id", "periodo", "semana", "fecha_cierre", "fecha_desde", "fecha_hasta", "cantidad_pagos", "ars_total", "cotizacion", "usd_pagado"]
};

function doGet(e) {
  const action = e.parameter.action || "bootstrap";

  if (action === "bootstrap") {
    ensureAllSheets();
    return jsonResponse({ ok: true, data: getBootstrap() });
  }

  return jsonResponse({ ok: false, error: "Acción no válida" });
}

function doPost(e) {
  try {
    ensureAllSheets();
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
  const sh = getSheet("pagos");
  appendObject(sh, "pagos", {
    id: body.id || newId(),
    fecha: body.fecha || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
    fecha_registro: body.fecha_registro || new Date().toISOString(),
    monto_ars: Number(body.monto_ars || 0),
    nota: body.nota || "",
    creado_por: body.creado_por || "Tincho"
  });

  return { ok: true, message: "Pago registrado" };
}

function addCierre(body) {
  const sh = getSheet("cierres");
  appendObject(sh, "cierres", {
    id: body.id || newId(),
    periodo: body.periodo || body.semana || "Período",
    semana: body.semana || body.periodo || "Período",
    fecha_cierre: body.fecha_cierre || new Date().toISOString(),
    fecha_desde: body.fecha_desde || "",
    fecha_hasta: body.fecha_hasta || body.fecha_cierre || new Date().toISOString(),
    cantidad_pagos: Number(body.cantidad_pagos || 0),
    ars_total: Number(body.ars_total || 0),
    cotizacion: Number(body.cotizacion || 0),
    usd_pagado: Number(body.usd_pagado || 0)
  });

  return { ok: true, message: "Cierre registrado" };
}

function readSheet(name) {
  const sh = getSheet(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  }).filter(obj => Object.values(obj).some(v => String(v || "").trim() !== ""));
}

function appendObject(sh, name, obj) {
  const headers = ensureHeaders(sh, HEADERS[name]);
  sh.appendRow(headers.map(h => obj[h] !== undefined ? obj[h] : ""));
}

function ensureAllSheets() {
  Object.keys(HEADERS).forEach(name => ensureHeaders(getSheet(name), HEADERS[name]));
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function ensureHeaders(sh, requiredHeaders) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  let headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].filter(h => String(h || "").trim() !== "");

  if (!headers.length) headers = [];
  requiredHeaders.forEach(h => {
    if (!headers.includes(h)) headers.push(h);
  });

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  return headers;
}

function newId() {
  return "id_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

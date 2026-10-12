/**
 * ==================================================================
 *  INPUT HARIAN PETERNAKAN WATUIRENG  —  Google Apps Script (Web App)
 * ==================================================================
 *  Petugas mengisi form (Index.html). Setiap input:
 *    1) dicatat di sheet DB_INPUT (log audit, append-only)
 *    2) di-posting ke 7 file Google Sheets dengan format PERSIS contoh:
 *       Recording Layer K1/K2/K3, Recap Telur (+Stok Telur), Stok Pakan,
 *       Data Obat Kandang, Laporan Keuangan.
 *
 *  Prinsip: script hanya mengisi sel INPUT. Sel rumus (D, L–P, Y–AG,
 *  SISA, Total, dst.) tidak pernah ditimpa.
 */

var APP = {
  TZ: 'Asia/Jakarta',
  SHEET_CONFIG: 'CONFIG',
  SHEET_DB: 'DB_INPUT',
  KANDANG: [1, 2, 3],
  // Kandang yang ikut dijumlahkan ke RECAP TELUR (ubah jika recap hanya untuk sebagian kandang)
  RECAP_KANDANG: [1, 2, 3],
  FEEDS: {
    'GROWER KH': { sheet: 'GROWER KH', col: 1, nota: 'Grower KH' },
    'PRE LAYER': { sheet: 'PRE LAYER', col: 1, nota: 'Pre Layer' },
    'L-208':     { sheet: 'L-208',     col: 1, nota: 'L-208' },
    'L-20':      { sheet: 'L - 20',    col: 2, nota: 'L-20' }   // sheet "L - 20" mulai dari kolom B
  },
  FILES: [
    ['REC_K1', 'RECORDING_LAYER_KANDANG_1'],
    ['REC_K2', 'RECORDING_LAYER_KANDANG_2'],
    ['REC_K3', 'RECORDING_LAYER_KANDANG_3'],
    ['RECAP', 'RECAP_TELUR_HARIAN'],
    ['PAKAN', 'STOK_PAKAN'],
    ['OBAT', 'DATA_OBAT_KANDANG'],
    ['KEUANGAN', 'LAPORAN_KEUANGAN_WATUIRENG']
  ],
  MONTHS: ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS',
           'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'],
  // kolom awal tiap minggu pada sheet STOK OBAT (D, N, W, AF, AO)
  OBAT_WEEK_START: [4, 14, 23, 32, 41],
  OBAT_BLOCK_GAP: 36,
  KAS_KET: ['Kas Masuk', 'Perlengkapan', 'Ongkos', 'Konsumsi', 'Bahan Bakar', 'Gaji'],
  KAS_SUB: ['Operasional', 'Modal'],
  KAS_METODE: ['Cash', 'Transfer'],
  SATUAN: ['pcs', 'ekor', 'kg', 'karung', 'liter', 'botol'],
  SUPPLIER: ['PT. SIBA PRIMA', 'KD Cepogo', 'PT. Yung Shin', 'PT. SHS', 'Mas Aji'],   // ubah sesuai kebutuhan
  DB_WINDOW: 3000,                                                                   // baris DB_INPUT terakhir yang dibaca (cukup utk 31 hari)
  MAX_BACKDAYS: 31,                                                                  // input mundur maksimal (hari)
  MAX: { deplesi: 300, butir: 5000, kg: 500, pakanKg: 2000, obatQty: 5000, rupiah: 100000000 }
};

/* ================================================================
 *  MENU & SETUP (Aman dijalankan dari Google Sheets maupun Script Editor)
 * ================================================================ */
function getUiSafe_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    return null;
  }
}

function alertSafe_(message) {
  var ui = getUiSafe_();
  if (ui) {
    try {
      ui.alert(message);
      return;
    } catch (e) {}
  }
  Logger.log('[ALERT / INFO]\n' + message);
}

function getMasterSpreadsheet_() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  var id = PropertiesService.getScriptProperties().getProperty('MASTER_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) {}
  }
  return null;
}

/** 
 * Fungsi bantuan jika script dibuat sebagai Standalone Script (bukan dari Ekstensi > Apps Script).
 * Masukkan ID atau URL Google Spreadsheet Master Anda di sini.
 */
function setMasterSpreadsheetId(urlOrId) {
  var id = String(urlOrId || '').trim();
  var m = id.match(/[-\w]{25,}/);
  if (m) id = m[0];
  if (!id) throw new Error('ID atau URL spreadsheet tidak valid.');
  var ss = SpreadsheetApp.openById(id);
  PropertiesService.getScriptProperties().setProperty('MASTER_ID', ss.getId());
  var info = '✓ MASTER_ID berhasil disetel ke spreadsheet: "' + ss.getName() + '" (' + ss.getId() + ')';
  Logger.log(info);
  alertSafe_(info);
  return ss.getId();
}

function onOpen() {
  var ui = getUiSafe_();
  if (!ui) {
    Logger.log('ℹ onOpen() dipanggil dari Script Editor. Menu "Watuireng" akan otomatis muncul saat tab Google Sheets dibuka/di-refresh di browser.');
    return;
  }
  try {
    ui.createMenu('Watuireng')
      .addItem('1. Setup awal', 'setup')
      .addItem('2. Cek koneksi file', 'checkConnections')
      .addSeparator()
      .addItem('3. Atur API Token (untuk Vercel/PWA)', 'setApiToken')
      .addItem('4. Atur PIN petugas (opsional)', 'setPin')
      .addItem('5. Info URL API & Token', 'showApiInfo')
      .addToUi();
  } catch (e) {
    Logger.log('Gagal membuat menu: ' + e.message);
  }
}

function setup() {
  var ss = getMasterSpreadsheet_();
  if (!ss) {
    var errMsg = 'Spreadsheet master tidak ditemukan!\n\n' +
                 'PENTING: Pastikan Anda membuka script ini melalui file master Google Sheets:\n' +
                 '  ▸ Buka file Google Sheets Anda di browser\n' +
                 '  ▸ Klik menu [Ekstensi] > [Apps Script]\n\n' +
                 'Jika script ini dibuat terpisah (Standalone), jalankan fungsi berikut di editor:\n' +
                 '  setMasterSpreadsheetId("TEMPEL_ID_ATAU_URL_SPREADSHEET_DI_SINI")';
    Logger.log(errMsg);
    alertSafe_(errMsg);
    throw new Error(errMsg);
  }

  PropertiesService.getScriptProperties().setProperty('MASTER_ID', ss.getId());

  var cfg = ss.getSheetByName(APP.SHEET_CONFIG) || ss.insertSheet(APP.SHEET_CONFIG);
  if (cfg.getLastRow() < 1) {
    cfg.getRange(1, 1, 1, 3).setValues([['KEY', 'FILE', 'URL / ID Google Sheets (tempel di sini)']]).setFontWeight('bold');
    cfg.getRange(2, 1, APP.FILES.length, 3).setValues(APP.FILES.map(function (f) { return [f[0], f[1], '']; }));
    cfg.setColumnWidth(3, 480);
  }
  var db = ss.getSheetByName(APP.SHEET_DB) || ss.insertSheet(APP.SHEET_DB);
  if (db.getLastRow() < 1) {
    db.getRange(1, 1, 1, 9).setValues([['Waktu', 'Petugas', 'Jenis', 'Tanggal', 'Kandang', 'ID', 'Payload (JSON)', 'Status', 'Pesan']]).setFontWeight('bold');
    db.setFrozenRows(1);
  }
  db.getRange('D:E').setNumberFormat('@');   // tanggal tetap teks yyyy-MM-dd
  
  var doneMsg = '✓ Setup selesai.\nSheet CONFIG dan DB_INPUT berhasil disiapkan di "' + ss.getName() + '".\n\n' +
                'Silakan isi URL/ID ketujuh file di sheet CONFIG, lalu jalankan "checkConnections".';
  Logger.log(doneMsg);
  alertSafe_(doneMsg);
}

/** Atur API Token langsung via kode (mudah dijalankan dari editor Apps Script). */
function setApiTokenManual(token) {
  var t = String(token || '').trim();
  var props = PropertiesService.getScriptProperties();
  if (t) {
    props.setProperty('API_TOKEN', t);
    var msg = '✓ API Token berhasil disimpan: "' + t + '"\nSalin token ini ke pengaturan PWA Vercel.';
    Logger.log(msg);
    alertSafe_(msg);
  } else {
    props.deleteProperty('API_TOKEN');
    var msg2 = 'API Token dinonaktifkan.';
    Logger.log(msg2);
    alertSafe_(msg2);
  }
}

function setApiToken() {
  var ui = getUiSafe_();
  var current = PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '';

  if (!ui) {
    var guide = 'Untuk menyetel API Token langsung dari Script Editor, gunakan fungsi setApiTokenManual("TOKEN_ANDA").\n' +
                'Contoh: setApiTokenManual("watuireng-secret-2026")\n' +
                'Token aktif saat ini: ' + (current || '(Belum disetel)');
    Logger.log(guide);
    return;
  }

  var promptMsg = 'Masukkan Token Rahasia (API Token) untuk frontend Vercel / GitHub Pages:\n' +
                  (current ? 'Token aktif saat ini: ' + current + '\n\n' : '\n') +
                  'Kosongkan jika ingin menonaktifkan token.';
  var r = ui.prompt('Atur API Token', promptMsg, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var token = r.getResponseText().trim();
  setApiTokenManual(token);
}

function setPin() {
  var ui = getUiSafe_();
  if (!ui) {
    Logger.log('Gunakan dialog di Google Sheets atau set manual via Script Properties untuk PIN.');
    return;
  }
  var r = ui.prompt('PIN petugas (kosongkan untuk menonaktifkan PIN)');
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var pin = r.getResponseText().trim();
  var props = PropertiesService.getScriptProperties();
  if (pin) props.setProperty('APP_PIN', pin); else props.deleteProperty('APP_PIN');
  ui.alert(pin ? 'PIN disimpan.' : 'PIN dinonaktifkan.');
}

function showApiInfo() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('API_TOKEN') || '(Belum disetel — jalankan setApiTokenManual)';
  var pin = props.getProperty('APP_PIN') || '(Tidak aktif)';
  var masterId = props.getProperty('MASTER_ID') || '';
  if (!masterId) {
    try { masterId = SpreadsheetApp.getActiveSpreadsheet().getId(); } catch (e) { masterId = '(Belum disetel)'; }
  }

  var msg = '=== INFORMASI API WATUIRENG ===\n\n' +
            '• Master Spreadsheet ID: ' + masterId + '\n' +
            '• API Token Aktif: ' + token + '\n' +
            '• PIN Petugas (Opsional): ' + pin + '\n\n' +
            'PETUNJUK DEPLOYMENT KE VERCEL / GITHUB PAGES:\n' +
            '1. Pada Google Apps Script, klik "Deploy" > "New deployment"\n' +
            '2. Pilih tipe: "Web app"\n' +
            '3. Execute as: "Me"\n' +
            '4. Who has access: "Anyone" (wajib agar petugas tanpa akun Google bisa posting data)\n' +
            '5. Salin Web app URL (berakhiran /exec) dan tempelkan ke aplikasi Vercel beserta API Token.';
  Logger.log(msg);
  alertSafe_(msg);
}

function checkConnections() {
  CacheService.getScriptCache().remove('obatList:' + Utilities.formatDate(new Date(), APP.TZ, 'yyyy'));
  var year = Number(Utilities.formatDate(new Date(), APP.TZ, 'yyyy'));
  var need = {
    REC_K1: ['Data Harian'], REC_K2: ['Data Harian'], REC_K3: ['Data Harian'],
    RECAP: ['RECAP TELUR', 'STOK TELUR'],
    PAKAN: ['NOTA PAKAN'].concat(Object.keys(APP.FEEDS).map(function (k) { return APP.FEEDS[k].sheet; })),
    OBAT: ['FAKTUR', 'STOK ' + year],
    KEUANGAN: ['KAS OPERASIONAL', 'PENJUALAN TELUR', 'PENJUALAN SAK', 'PENJUALAN AYAM AFKIR', 'PENJUALAN BELEK']
  };
  var out = [];
  APP.FILES.forEach(function (f) {
    try {
      var ss = file_(f[0]);
      var missing = need[f[0]].filter(function (n) { try { sheet_(ss, n); return false; } catch (e) { return true; } });
      out.push((missing.length ? '⚠ ' : '✓ ') + f[0] + ' — ' + ss.getName() + (missing.length ? ' (sheet tidak ada: ' + missing.join(', ') + ')' : ''));
    } catch (e) { out.push('✗ ' + f[0] + ' — ' + e.message); }
  });
  var report = out.join('\n');
  Logger.log('=== HASIL CEK KONEKSI FILE ===\n' + report);
  alertSafe_(report);
}

/* ================================================================
 *  WEB APP & JSON API (CORS & OFFLINE QUEUE COMPATIBLE)
 * ================================================================ */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    // Jika terdapat parameter action, layani sebagai API JSON (berguna untuk health-check / ping)
    if (p.action) {
      var token = p.token || p.auth || p.pin || '';
      var result = handleApiAction_(p.action, p, token);
      return jsonResponse_(result);
    }

    // Default GET: Serve HTML (kompatibilitas backward jika diakses via link GAS langsung)
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Input Harian Watuireng')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  }
}

function doPost(e) {
  try {
    var raw = '';
    if (e && e.postData && e.postData.contents) {
      raw = e.postData.contents;
    }

    var body = {};
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch (pe) {
        body = (e && e.parameter) || {};
      }
    } else if (e && e.parameter) {
      body = e.parameter;
    }

    var action = body.action || (e && e.parameter && e.parameter.action) || 'submit';
    var token = body.token || body.auth || body.pin || (e && e.parameter && (e.parameter.token || e.parameter.pin)) || '';

    var result = handleApiAction_(action, body, token);
    return jsonResponse_(result);
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleApiAction_(action, data, token) {
  switch (action) {
    case 'ping':
      return {
        ok: true,
        message: 'Watuireng API Online',
        time: Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HH:mm:ss'),
        tz: APP.TZ
      };

    case 'bootstrap':
      return {
        ok: true,
        data: getBootstrap(token)
      };

    case 'getEntry':
      return {
        ok: true,
        data: getEntry(token, data.type, data.tanggal, data.kandang)
      };

    case 'getSummary':
      return {
        ok: true,
        data: getSummary(token)
      };

    case 'getAllData':
    case 'getHistory':
      return {
        ok: true,
        data: getAllData(token)
      };

    case 'submit':
      var subRes = submit(token, data.type, data.payload, data.id, data.petugas);
      return {
        ok: subRes.ok,
        log: subRes.log,
        warn: subRes.warn,
        id: data.id || ''
      };

    case 'syncQueue':
    case 'batchSubmit':
      checkAuth_(token);
      var items = Array.isArray(data.items) ? data.items : [];
      var results = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        try {
          var itemRes = submit(token, it.type, it.payload, it.id, it.petugas);
          results.push({
            id: it.id,
            ok: itemRes.ok,
            log: itemRes.log,
            warn: itemRes.warn
          });
        } catch (itemErr) {
          results.push({
            id: it.id,
            ok: false,
            error: itemErr.message || String(itemErr)
          });
        }
      }
      return {
        ok: true,
        count: results.length,
        results: results
      };

    default:
      throw new Error('Aksi API tidak dikenal: ' + action);
  }
}

function checkAuth_(tokenOrPin) {
  var props = PropertiesService.getScriptProperties();
  var expectedToken = props.getProperty('API_TOKEN');
  var expectedPin = props.getProperty('APP_PIN');

  // Bila belum pernah disetel sama sekali, izinkan agar tidak mengunci setup awal
  if (!expectedToken && !expectedPin) return true;

  var val = String(tokenOrPin || '').trim();
  if (!val) throw new Error('Akses ditolak: API Token atau PIN wajib disertakan');

  if (expectedToken && val === expectedToken.trim()) return true;
  if (expectedPin && val === expectedPin.trim()) return true;

  throw new Error('Akses ditolak: Token atau PIN salah');
}

function checkPin_(pin) {
  return checkAuth_(pin);
}

function getBootstrap(pin) {
  checkPin_(pin);
  var obat = [];
  try { obat = obatList_(); } catch (e) { obat = []; }
  return {
    today: Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'),
    kandang: APP.KANDANG,
    feeds: Object.keys(APP.FEEDS),
    obat: obat,
    minDate: addDays_(Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'), -APP.MAX_BACKDAYS),
    kasKet: APP.KAS_KET, kasSub: APP.KAS_SUB, kasMetode: APP.KAS_METODE,
    satuan: APP.SATUAN, supplier: APP.SUPPLIER, max: APP.MAX
  };
}

/** Ambil data tersimpan terakhir (untuk koreksi/ubah data tanggal yang sama). */
function getEntry(pin, type, tanggal, kandang) {
  checkPin_(pin);
  var found = null, done = [];
  dbRows_().forEach(function (r) {
    if (r.date !== tanggal) return;
    if (r.type === 'harian' && done.indexOf(Number(r.kandang)) < 0) done.push(Number(r.kandang));
    if (r.type === type && (type !== 'harian' || String(r.kandang) === String(kandang))) found = r.payload;
  });
  return { entry: found, done: done };
}

function summ_(r) {
  var p = r.payload || {};
  switch (r.type) {
    case 'harian': return 'Kandang ' + r.kandang + (p.butir != null ? ' · ' + p.butir.toLocaleString() + ' butir' : '') + (p.kgTotal != null ? ' · ' + p.kgTotal + ' kg' : '') + (p.pakanKg != null ? ' · Pakan ' + p.pakanKg + ' kg' : '');
    case 'telur_stok': return 'Stok & kirim telur' + (p.kirimBagus15 ? ' · Kirim ' + p.kirimBagus15 + ' krat (15kg)' : '') + (p.kirimBagusKg ? ' · ' + p.kirimBagusKg + ' kg' : '') + (p.sisaBagus15 ? ' · Sisa ' + p.sisaBagus15 + ' krat' : '');
    case 'pakan_masuk': return (p.jenis || 'Pakan') + ' · ' + (p.qty || 0).toLocaleString() + ' kg' + (p.harga ? ' @ Rp ' + (p.harga || 0).toLocaleString() : '');
    case 'obat_masuk': return (p.obat || p.nama || 'Obat') + ' · ' + (p.qty || 0).toLocaleString() + ' ' + (p.satuan || '');
    case 'kas': return (p.arah === 'masuk' ? '[+] Masuk: ' : '[-] Keluar: ') + (p.nama || 'Kas') + ' · Rp ' + Math.round(p.nominal || 0).toLocaleString();
    case 'jual_telur': return 'Penjualan telur' + (p.bagusKg ? ' · Bagus ' + p.bagusKg + ' kg' : '') + (p.putihKg ? ' · Putih ' + p.putihKg + ' kg' : '') + (p.bucekKg ? ' · Bucek ' + p.bucekKg + ' kg' : '');
    case 'jual_lain': return (p.jenis ? p.jenis.toUpperCase() : 'Jual') + ' · ' + (p.nama || '') + ' · ' + (p.qty || 0) + ' ' + (p.satuan || '') + (p.harga ? ' @ Rp ' + (p.harga || 0).toLocaleString() : '');
  }
  return '';
}

function targetSheetName_(type, kandang) {
  switch (type) {
    case 'harian': return 'RECORDING_LAYER_K' + (kandang || 1) + ' & RECAP TELUR HARIAN';
    case 'telur_stok': return 'RECAP_TELUR_HARIAN ▸ STOK TELUR';
    case 'pakan_masuk': return 'STOK_PAKAN ▸ NOTA PAKAN & STOK HARIAN';
    case 'obat_masuk': return 'DATA_OBAT_KANDANG ▸ FAKTUR & STOK BULANAN';
    case 'kas': return 'LAPORAN_KEUANGAN_WATUIRENG ▸ KAS OPERASIONAL';
    case 'jual_telur': return 'LAPORAN_KEUANGAN_WATUIRENG ▸ PENJUALAN TELUR';
    case 'jual_lain': return 'LAPORAN_KEUANGAN_WATUIRENG ▸ PENJUALAN SAK/AFKIR/BELEK';
  }
  return 'MASTER SPREADSHEET';
}

/** Ringkasan untuk Beranda & Riwayat Lengkap Seluruh Data Spreadsheet. */
function getSummary(pin) {
  checkPin_(pin);
  var today = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'), rows = dbRows_(), done = [], telur = false, cnt = 0;
  rows.forEach(function (r) {
    if (r.date !== today) return;
    cnt++;
    if (r.type === 'harian' && done.indexOf(Number(r.kandang)) < 0) done.push(Number(r.kandang));
    if (r.type === 'telur_stok') telur = true;
  });

  var recent = rows.slice(-300).reverse().map(function (r) {
    return {
      id: r.id,
      type: r.type,
      date: r.date,
      kandang: r.kandang,
      petugas: r.petugas || 'Mba Erlin',
      status: r.status,
      msg: String(r.msg || '').slice(0, 300),
      time: isDate_(r.time) ? Utilities.formatDate(r.time, APP.TZ, 'dd/MM/yyyy HH:mm') : String(r.time || ''),
      sum: summ_(r),
      targetSheet: targetSheetName_(r.type, r.kandang),
      payload: r.payload || {}
    };
  });
  return { today: today, done: done, telur: telur, count: cnt, totalRows: rows.length, recent: recent };
}

function getAllData(pin) {
  return getSummary(pin);
}

function submit(pin, type, payload, id, petugas) {
  checkPin_(pin);
  var h = HANDLERS[type];
  if (!h) throw new Error('Jenis input tidak dikenal: ' + type);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var before = dbRows_();
    if (id && before.some(function (r) { return r.id === id; })) {
      return { ok: true, log: ['ℹ Data ini sudah tersimpan sebelumnya — tidak diproses ulang.'], warn: [] };
    }
    var o = h.validate(payload || {});
    var ctx = { before: before, after: null, log: [], warn: (o._warn || []).slice(), fail: 0 };
    delete o._warn;

    var prev = null;
    if (type === 'harian') prev = latestMap_(before, o.tanggal)[o.kandang] || null;
    ctx.prev = prev;

    var entry = { type: type, date: o.tanggal, kandang: o.kandang || '', id: id || Utilities.getUuid(), payload: o, status: '', msg: '' };
    ctx.after = before.concat([entry]);
    var dbRow = appendDb_(entry, petugas);

    h.post(o, ctx);

    var status = ctx.fail ? 'PARTIAL' : 'OK';
    db_().getRange(dbRow, 8, 1, 2).setValues([[status, ctx.log.join(' | ').slice(0, 900)]]);
    return { ok: ctx.fail === 0, log: ctx.log, warn: ctx.warn };
  } finally {
    lock.releaseLock();
  }
}

/* ================================================================
 *  VALIDASI
 * ================================================================ */
function reqDate_(s) {
  s = String(s || '');
  parseYmd_(s);
  var today = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
  if (s > today) throw new Error('Tanggal tidak boleh di masa depan');
  if (s < addDays_(today, -APP.MAX_BACKDAYS)) throw new Error('Tanggal terlalu lama (maks. ' + APP.MAX_BACKDAYS + ' hari ke belakang) — koreksi langsung di sheet');
  return s;
}
function numOpt_(v, label) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(String(v).replace(',', '.'));
  if (isNaN(n) || n < 0) throw new Error(label + ' harus berupa angka ≥ 0');
  return n;
}
function numReq_(v, label) {
  var n = numOpt_(v, label);
  if (n === null) throw new Error(label + ' wajib diisi');
  return n;
}
function inList_(v, list, label, allowEmpty) {
  v = String(v === null || v === undefined ? '' : v).trim();
  if (!v && allowEmpty) return '';
  for (var i = 0; i < list.length; i++) if (norm_(list[i]) === norm_(v)) return list[i];
  throw new Error(label + ' harus dipilih dari daftar');
}
function maxChk_(v, max, label) {
  if (v !== null && v > max) throw new Error(label + ' tidak masuk akal (maks. ' + max + ')');
  return v;
}
function obatNames_() {
  if (obatNames_.c) return obatNames_.c;
  var l = [];
  try { l = obatList_(); } catch (e) { l = []; }
  return (obatNames_.c = l);
}
function txt_(v, max) { return String(v === null || v === undefined ? '' : v).trim().slice(0, max || 200); }
function r3_(x) { return Math.round(x * 1000) / 1000; }

function vHarian_(p) {
  var o = { tanggal: reqDate_(p.tanggal), kandang: Number(p.kandang), _warn: [] };
  if (APP.KANDANG.indexOf(o.kandang) < 0) throw new Error('Kandang tidak valid');
  var f = { deplesi: 'Deplesi', butir: 'Butir', kgBagus: 'Kg bagus', kgPutih: 'Kg putih', kgBucek: 'Kg bucek',
            kgBucekParah: 'Kg bucek parah', bijianBucek: 'Bucekan (bijian)', bijianPutih: 'Putihan (bijian)',
            pakanKg: 'Pakan (kg)', hargaPakan: 'Harga pakan', hargaTelur: 'Harga telur', biayaObat: 'Biaya obat',
            biayaOp: 'Biaya operasional', biayaLain: 'Lain-lain' };
  Object.keys(f).forEach(function (k) { o[k] = numOpt_(p[k], f[k]); });
  maxChk_(o.deplesi, APP.MAX.deplesi, 'Deplesi'); maxChk_(o.butir, APP.MAX.butir, 'Butir');
  ['kgBagus', 'kgPutih', 'kgBucek', 'kgBucekParah'].forEach(function (k) { maxChk_(o[k], APP.MAX.kg, f[k]); });
  ['deplesi', 'butir', 'bijianBucek', 'bijianPutih'].forEach(function (k) { if (o[k] !== null && o[k] % 1 !== 0) throw new Error(f[k] + ' harus bilangan bulat'); });
  maxChk_(o.pakanKg, APP.MAX.pakanKg, 'Pakan (kg)');
  ['hargaPakan', 'hargaTelur', 'biayaObat', 'biayaOp', 'biayaLain'].forEach(function (k) { maxChk_(o[k], APP.MAX.rupiah, f[k]); });
  o.jenisPakan = txt_(p.jenisPakan, 20).toUpperCase();
  if (o.jenisPakan && !APP.FEEDS[o.jenisPakan]) throw new Error('Jenis pakan tidak dikenal: ' + o.jenisPakan);
  if (o.pakanKg && !o.jenisPakan) throw new Error('Pilih jenis pakan');
  if (!o.pakanKg) o.jenisPakan = o.jenisPakan || '';
  var kgs = [o.kgBagus, o.kgPutih, o.kgBucek, o.kgBucekParah];
  o.kgTotal = kgs.some(function (x) { return x !== null; }) ? r3_(kgs.reduce(function (a, b) { return a + (b || 0); }, 0)) : null;
  var daftarObat = obatNames_().map(function (x) { return x.nama; });
  o.obat = (Array.isArray(p.obat) ? p.obat : []).map(function (x) {
    var nama = txt_(x && x.nama, 60), qty = Number(String((x && x.qty) || '').replace(',', '.'));
    if (nama && !(qty > 0)) throw new Error('Jumlah obat "' + nama + '" wajib diisi');
    if (qty > APP.MAX.obatQty) throw new Error('Jumlah obat tidak masuk akal');
    if (nama && daftarObat.length) nama = inList_(nama, daftarObat, 'Obat');
    return { nama: nama, qty: qty };
  }).filter(function (x) { return x.nama && x.qty > 0; });
  o.ket = txt_(p.ket, 200);
  if (!o.ket && o.obat.length) o.ket = o.obat.map(function (x) { return x.nama.toUpperCase(); }).join(' + ');
  if (o.butir > 0 && o.kgTotal > 0) {
    var g = o.kgTotal / o.butir * 1000;
    if (g < 40 || g > 80) o._warn.push('Rata-rata berat telur ' + Math.round(g) + ' g/butir — di luar kisaran 40–80 g, cek kg/butir.');
  }
  if (o.kgTotal > 0 && !(o.butir > 0)) o._warn.push('Kg telur diisi tapi butir kosong.');
  var any = ['deplesi', 'butir', 'kgBagus', 'kgPutih', 'kgBucek', 'kgBucekParah', 'bijianBucek', 'bijianPutih', 'pakanKg', 'hargaPakan', 'hargaTelur', 'biayaObat', 'biayaOp', 'biayaLain']
    .some(function (k) { return o[k] !== null; }) || o.obat.length || o.ket;
  if (!any) throw new Error('Belum ada data yang diisi (bila nihil, isi 0 pada Deplesi)');
  return o;
}

var TELUR_COLS = [
  ['kirimBagus15', 6], ['kirimBagus10', 7], ['kirimBagusKg', 8], ['kirimPutih', 9], ['kirimBucek', 10],
  ['bawaBagusKotak', 11], ['bawaBagusKg', 12], ['bawaPutih', 13], ['bawaBucek', 14],
  ['ket', 15, 'text'],
  ['jualBagusKotak', 16], ['jualBagusKg', 17], ['jualPutih', 18], ['jualBucek', 19],
  ['sisaBagus15', 20], ['sisaBagus10', 21], ['sisaBagusKg', 22], ['sisaPutih', 23], ['sisaBucek', 24], ['sisaBucekParah', 25],
  ['beliLuar', 26], ['pecah', 27], ['dimasak', 28], ['warga', 29]
];
function vTelurStok_(p) {
  var o = { tanggal: reqDate_(p.tanggal) };
  var any = false;
  TELUR_COLS.forEach(function (c) {
    o[c[0]] = c[2] === 'text' ? txt_(p[c[0]], 100) : maxChk_(numOpt_(p[c[0]], c[0]), 100000, c[0]);
    if (o[c[0]] !== null && o[c[0]] !== '') any = true;
  });
  if (!any) throw new Error('Isi minimal satu kolom');
  return o;
}
function vPakanMasuk_(p) {
  var o = { tanggal: reqDate_(p.tanggal), jenis: txt_(p.jenis, 20).toUpperCase() };
  if (!APP.FEEDS[o.jenis]) throw new Error('Pilih jenis pakan');
  o.qty = numReq_(p.qty, 'Qty (kg)'); o.harga = numReq_(p.harga, 'Harga /kg');
  o.diskon = numOpt_(p.diskon, 'Diskon'); o.noFaktur = txt_(p.noFaktur, 30);
  o.supplier = inList_(p.supplier, APP.SUPPLIER, 'Supplier', true);
  maxChk_(o.qty, 100000, 'Qty'); maxChk_(o.harga, 100000, 'Harga /kg'); maxChk_(o.diskon, APP.MAX.rupiah, 'Diskon');
  if (o.qty <= 0) throw new Error('Qty harus > 0');
  return o;
}
function vObatMasuk_(p) {
  var daftar = obatNames_();
  if (!daftar.length) throw new Error('Daftar obat (STOK ' + Utilities.formatDate(new Date(), APP.TZ, 'yyyy') + ') tidak terbaca — cek CONFIG');
  var nama = inList_(p.obat, daftar.map(function (x) { return x.nama; }), 'Obat');
  var satuan = '';
  daftar.forEach(function (x) { if (x.nama === nama) satuan = x.satuan; });
  var o = { tanggal: reqDate_(p.tanggal), nama: nama, satuan: satuan };
  o.qty = numReq_(p.qty, 'Qty (' + (satuan || 'satuan stok') + ')');
  if (o.qty <= 0) throw new Error('Qty harus > 0');
  maxChk_(o.qty, APP.MAX.obatQty * 10, 'Qty');
  o.harga = numOpt_(p.harga, 'Harga'); o.ppn = numOpt_(p.ppn, 'PPN'); o.potongan = numOpt_(p.potongan, 'Potongan');
  o.jatuhTempo = p.jatuhTempo ? reqDateAny_(p.jatuhTempo) : '';
  if (o.jatuhTempo && o.jatuhTempo < o.tanggal) throw new Error('Tgl jatuh tempo tidak boleh sebelum tanggal masuk');
  ['harga', 'ppn', 'potongan'].forEach(function (k) { maxChk_(o[k], APP.MAX.rupiah, k); });
  o.ket = inList_(p.supplier, APP.SUPPLIER, 'Supplier', true); o.pengingat = '';
  o.stokItem = nama; o.stokQty = o.qty;   // faktur & stok selalu sinkron
  return o;
}
function reqDateAny_(s) { parseYmd_(String(s)); return String(s); }
function vKas_(p) {
  var o = { tanggal: reqDate_(p.tanggal), nama: txt_(p.nama, 80), arah: p.arah === 'masuk' ? 'masuk' : 'keluar' };
  if (!o.nama) throw new Error('Nama transaksi wajib diisi');
  o.qty = numOpt_(p.qty, 'Qty'); o.harga = numOpt_(p.harga, 'Harga @'); o.nominal = numOpt_(p.nominal, 'Nominal');
  if (o.nominal === null && o.qty !== null && o.harga !== null) o.nominal = o.qty * o.harga;
  if (!(o.nominal > 0)) throw new Error('Nominal (atau Qty × Harga) wajib > 0');
  o.ket = inList_(p.ket, APP.KAS_KET, 'Kategori');
  o.sub = inList_(p.sub || APP.KAS_SUB[0], APP.KAS_SUB, 'SUB');
  o.metode = inList_(p.metode || APP.KAS_METODE[0], APP.KAS_METODE, 'Cash/Transfer');
  maxChk_(o.nominal, APP.MAX.rupiah, 'Nominal');
  return o;
}
function vJualTelur_(p) {
  var o = { tanggal: reqDate_(p.tanggal), uangTelur: !!p.uangTelur };
  var any = false;
  ['bagus', 'putih', 'bucek', 'plastik'].forEach(function (g) {
    o[g + 'Kg'] = numOpt_(p[g + 'Kg'], 'Kg ' + g); o[g + 'Harga'] = numOpt_(p[g + 'Harga'], 'Harga ' + g);
    maxChk_(o[g + 'Kg'], APP.MAX.kg, 'Kg ' + g);
    if (o[g + 'Kg'] > 0) { any = true; if (!(o[g + 'Harga'] > 0)) throw new Error('Harga telur ' + g + ' wajib diisi'); }
  });
  if (!any) throw new Error('Isi minimal satu jenis telur yang terjual');
  return o;
}
function vJualLain_(p) {
  var o = { tanggal: reqDate_(p.tanggal), jenis: txt_(p.jenis, 10), nama: txt_(p.nama, 60), satuan: inList_(p.satuan, APP.SATUAN, 'Satuan') };
  if (['sak', 'afkir', 'belek'].indexOf(o.jenis) < 0) throw new Error('Jenis penjualan tidak valid');
  if (!o.nama) throw new Error('Nama wajib diisi');
  o.qty = numReq_(p.qty, 'Qty'); o.harga = numReq_(p.harga, 'Harga'); o.kredit = numOpt_(p.kredit, 'Kredit/setor');
  if (!(o.qty > 0) || !(o.harga > 0)) throw new Error('Qty dan Harga harus > 0');
  maxChk_(o.qty * o.harga, APP.MAX.rupiah, 'Total');
  return o;
}

/* ================================================================
 *  HANDLER POSTING
 * ================================================================ */
var HANDLERS = {
  harian: { validate: vHarian_, post: postHarian_ },
  telur_stok: { validate: vTelurStok_, post: postTelurStok_ },
  pakan_masuk: { validate: vPakanMasuk_, post: postPakanMasuk_ },
  obat_masuk: { validate: vObatMasuk_, post: postObatMasuk_ },
  kas: { validate: vKas_, post: postKas_ },
  jual_telur: { validate: vJualTelur_, post: postJualTelur_ },
  jual_lain: { validate: vJualLain_, post: postJualLain_ }
};

function step_(ctx, label, fn) {
  try {
    var m = fn();
    ctx.log.push('✓ ' + label + (m ? ' — ' + m : ''));
  } catch (e) {
    ctx.fail++;
    ctx.log.push('✗ ' + label + ': ' + e.message);
  }
}

/* ---------- Harian per kandang ---------- */
function postHarian_(o, ctx) {
  step_(ctx, 'Recording Kandang ' + o.kandang, function () { return postRecording_(o, ctx); });

  var recapKeys = ['kgBagus', 'kgPutih', 'kgBucek', 'kgBucekParah', 'bijianBucek', 'bijianPutih'];
  var touches = recapKeys.some(function (k) { return o[k] !== null || (ctx.prev && ctx.prev[k] !== null && ctx.prev[k] !== undefined); });
  if (touches && APP.RECAP_KANDANG.indexOf(o.kandang) >= 0) {
    step_(ctx, 'Recap Telur', function () { return syncRecap_(o.tanggal, ctx); });
  }

  var feeds = {};
  if (o.jenisPakan) feeds[o.jenisPakan] = 1;
  if (ctx.prev && ctx.prev.jenisPakan) feeds[ctx.prev.jenisPakan] = 1;
  Object.keys(feeds).forEach(function (f) {
    step_(ctx, 'Stok pakan ' + f, function () { return syncFeed_(o.tanggal, f, ctx); });
  });

  var names = {};
  o.obat.forEach(function (x) { names[norm_(x.nama)] = x.nama; });
  if (ctx.prev && ctx.prev.obat) ctx.prev.obat.forEach(function (x) { names[norm_(x.nama)] = x.nama; });
  Object.keys(names).forEach(function (n) {
    step_(ctx, 'Stok obat ' + names[n], function () { return syncObat_(o.tanggal, names[n], ctx); });
  });
}

function postRecording_(o, ctx) {
  var sh = sheet_(file_('REC_K' + o.kandang), 'Data Harian');
  var row = findDateRow_(sh, 1, o.tanggal, 11);
  if (row < 0) throw new Error('tanggal ' + o.tanggal + ' tidak ada di kolom A');
  var cur = sh.getRange(row, 1, 1, 34).getValues()[0];
  var map = {
    3: o.deplesi, 5: o.jenisPakan || null, 6: o.butir, 7: o.kgTotal,
    8: o.kgBagus, 9: o.kgPutih, 10: o.kgBucek, 11: o.pakanKg,
    17: o.ket || null, 21: o.hargaTelur, 27: o.biayaObat, 28: o.biayaOp, 29: o.biayaLain
  };
  var hp = o.hargaPakan, auto = false;
  if (hp === null && o.pakanKg && o.jenisPakan && cur[23] === '') {
    hp = latestFeedPrice_(o.jenisPakan, o.tanggal);
    auto = hp !== null;
  }
  if (hp !== null) map[24] = hp;
  writeRow_(sh, row, map, ctx, 'Rec K' + o.kandang);
  return 'baris ' + row + (auto ? ', harga pakan otomatis dari nota (' + hp + ')' : '');
}

function syncRecap_(date, ctx) {
  var sh = sheet_(file_('RECAP'), 'RECAP TELUR');
  var row = findDateRow_(sh, 1, date, 5);
  if (row < 0) throw new Error('tanggal ' + date + ' tidak ada di RECAP TELUR');
  var latest = latestMap_(ctx.after, date);
  var sum = { kgBagus: 0, kgPutih: 0, kgBucek: 0, kgBucekParah: 0 };
  var map = {}, seen = false;
  APP.RECAP_KANDANG.forEach(function (k) {
    var p = latest[k]; if (!p) return;
    seen = true;
    Object.keys(sum).forEach(function (g) { sum[g] += p[g] || 0; });
    if (p.bijianBucek !== null && p.bijianBucek !== undefined) map[2 + 2 * (k - 1)] = p.bijianBucek;
    if (p.bijianPutih !== null && p.bijianPutih !== undefined) map[3 + 2 * (k - 1)] = p.bijianPutih;
  });
  if (!seen) return 'tidak ada data';
  map[9] = sum.kgBagus ? r3_(sum.kgBagus) : '';
  map[10] = sum.kgPutih ? r3_(sum.kgPutih) : '';
  map[11] = sum.kgBucek ? r3_(sum.kgBucek) : '';
  map[12] = sum.kgBucekParah ? r3_(sum.kgBucekParah) : '';
  writeRow_(sh, row, map, ctx, 'Recap');
  if (!sh.getRange(row, 8).getFormula()) sh.getRange(row, 8).setFormula('=SUM(I' + row + ':L' + row + ')');
  return 'baris ' + row;
}

/* ---------- Stok & distribusi telur ---------- */
function postTelurStok_(o, ctx) {
  step_(ctx, 'Stok Telur', function () {
    var sh = sheet_(file_('RECAP'), 'STOK TELUR');
    var row = findDateRow_(sh, 1, o.tanggal, 4);
    if (row < 0) throw new Error('tanggal ' + o.tanggal + ' tidak ada di STOK TELUR');
    var map = {};
    TELUR_COLS.forEach(function (c) { var v = o[c[0]]; if (v !== null && v !== '') map[c[1]] = v; });
    writeRow_(sh, row, map, ctx, 'Stok Telur');
    return 'baris ' + row;
  });
}

/* ---------- Pakan masuk ---------- */
function postPakanMasuk_(o, ctx) {
  step_(ctx, 'Nota Pakan', function () {
    var sh = sheet_(file_('PAKAN'), 'NOTA PAKAN');
    var row = firstFree_(sh, 3, [1, 4, 5], 9);
    sh.getRange(row, 1).setValue(dateFor_(sh.getParent(), o.tanggal));
    var map = { 3: o.noFaktur || null, 4: APP.FEEDS[o.jenis].nota, 5: o.qty, 6: o.harga, 8: o.diskon, 9: o.supplier || null };
    writeRow_(sh, row, map, ctx, 'Nota');
    if (!sh.getRange(row, 7).getFormula()) sh.getRange(row, 7).setFormula('=E' + row + '*F' + row);
    return 'baris ' + row;
  });
  step_(ctx, 'Stok pakan ' + o.jenis, function () { return syncFeed_(o.tanggal, o.jenis, ctx); });
}

/* ---------- Obat masuk ---------- */
function postObatMasuk_(o, ctx) {
  step_(ctx, 'Faktur Obat', function () {
    var sh = sheet_(file_('OBAT'), 'FAKTUR');
    var row = firstFree_(sh, 4, [1, 3, 4], 11);
    var ss = sh.getParent();
    sh.getRange(row, 1).setValue(dateFor_(ss, o.tanggal));
    if (o.jatuhTempo) sh.getRange(row, 2).setValue(dateFor_(ss, o.jatuhTempo));
    var map = { 3: o.nama, 4: o.qty, 5: o.satuan || null, 6: o.harga, 7: o.ppn, 8: o.potongan, 10: o.ket || null, 11: o.pengingat || null };
    writeRow_(sh, row, map, ctx, 'Faktur');
    if (!sh.getRange(row, 9).getFormula()) sh.getRange(row, 9).setFormula('=D' + row + '*F' + row + '+G' + row + '-H' + row);
    return 'baris ' + row;
  });
  if (o.stokItem) {
    step_(ctx, 'Stok obat ' + o.stokItem, function () { return syncObat_(o.tanggal, o.stokItem, ctx); });
  }
}

/* ---------- Keuangan ---------- */
function postKas_(o, ctx) {
  step_(ctx, 'Kas Operasional', function () {
    var sh = sheet_(file_('KEUANGAN'), 'KAS OPERASIONAL');
    var row = firstFree_(sh, 5, [1, 2, 5, 6], 10);
    sh.getRange(row, 1).setValue(dateFor_(sh.getParent(), o.tanggal));
    var map = { 2: o.nama, 3: o.qty, 4: o.harga, 5: o.arah === 'masuk' ? o.nominal : null, 6: o.arah === 'keluar' ? o.nominal : null, 8: o.ket || null, 9: o.sub, 10: o.metode };
    writeRow_(sh, row, map, ctx, 'Kas');
    if (!sh.getRange(row, 7).getFormula()) sh.getRange(row, 7).setFormula(row === 5 ? '=E5-F5' : '=G' + (row - 1) + '+E' + row + '-F' + row);
    return 'baris ' + row;
  });
}

function postJualTelur_(o, ctx) {
  var total = 0;
  step_(ctx, 'Penjualan Telur', function () {
    var sh = sheet_(file_('KEUANGAN'), 'PENJUALAN TELUR');
    var last = sh.getLastRow();
    var v = sh.getRange(5, 1, Math.max(last - 4, 1), 8).getValues();
    var row = -1;
    for (var i = 0; i < v.length && row < 0; i++) {
      if (String(v[i][1]).trim() !== 'Telur Bagus') continue;
      var empty = true;
      for (var j = 0; j < 4; j++) {
        var rr = v[i + j];
        if (!rr || rr[0] !== '' || rr[2] !== '' || rr[4] !== '') { empty = false; break; }
      }
      if (empty) row = 5 + i;
    }
    if (row < 0) throw new Error('tidak ada blok kosong 4-baris (Bagus/Putih/Bucek/Plastik) — salin blok terakhir ke bawah');
    sh.getRange(row, 1).setValue(dateFor_(sh.getParent(), o.tanggal));
    ['bagus', 'putih', 'bucek', 'plastik'].forEach(function (g, i) {
      var r = row + i;
      if (o[g + 'Kg'] > 0) {
        sh.getRange(r, 3).setValue(o[g + 'Kg']); sh.getRange(r, 5).setValue(o[g + 'Harga']);
        total += o[g + 'Kg'] * o[g + 'Harga'];
      }
      if (!sh.getRange(r, 6).getFormula()) sh.getRange(r, 6).setFormula('=C' + r + '*E' + r);
    });
    if (!sh.getRange(row + 3, 8).getFormula()) sh.getRange(row + 3, 8).setFormula('=SUM(F' + row + ':F' + (row + 3) + ')');
    return 'baris ' + row + '–' + (row + 3) + ', total Rp ' + Math.round(total);
  });
  if (o.uangTelur) {
    step_(ctx, 'Laporan Uang Telur', function () {
      var sh = sheet_(file_('KEUANGAN'), 'PENJUALAN TELUR');
      var row = firstFree_(sh, 5, [10, 11, 12, 13], 14, 10);
      sh.getRange(row, 10).setValue(dateFor_(sh.getParent(), o.tanggal));
      sh.getRange(row, 11).setValue('Pendapatan uang telur');
      sh.getRange(row, 12).setValue(Math.round(total));
      if (!sh.getRange(row, 14).getFormula()) sh.getRange(row, 14).setFormula(row === 5 ? '=L5-M5' : '=N' + (row - 1) + '+L' + row + '-M' + row);
      return 'baris ' + row;
    });
  }
}

function postJualLain_(o, ctx) {
  var cfg = { sak: ['PENJUALAN SAK', 5], afkir: ['PENJUALAN AYAM AFKIR', 6], belek: ['PENJUALAN BELEK', 5] }[o.jenis];
  step_(ctx, cfg[0], function () {
    var sh = sheet_(file_('KEUANGAN'), cfg[0]);
    var row = firstFree_(sh, cfg[1], [1, 2, 3, 7], 8);
    sh.getRange(row, 1).setValue(dateFor_(sh.getParent(), o.tanggal));
    writeRow_(sh, row, { 2: o.nama, 3: o.qty, 4: o.satuan || null, 5: o.harga, 7: o.kredit }, ctx, o.jenis);
    if (!sh.getRange(row, 6).getFormula()) sh.getRange(row, 6).setFormula('=C' + row + '*E' + row);
    if (!sh.getRange(row, 8).getFormula()) {
      var first = row === cfg[1] && o.jenis === 'sak';
      sh.getRange(row, 8).setFormula(first ? '=F' + row : '=H' + (row - 1) + '+F' + row + '-G' + row);
    }
    return 'baris ' + row + ', total Rp ' + Math.round(o.qty * o.harga);
  });
}

/* ================================================================
 *  SINKRONISASI TURUNAN (stok pakan, stok obat) — hasil dihitung dari DB_INPUT
 *  sehingga aman bila tanggal yang sama diinput ulang (koreksi).
 * ================================================================ */
function latestMap_(rows, date) {
  var m = {};
  rows.forEach(function (r) { if (r.type === 'harian' && r.date === date) m[r.kandang] = r.payload; });
  return m;
}
function feedOut_(rows, date, feed) {
  var m = latestMap_(rows, date), s = 0;
  Object.keys(m).forEach(function (k) { if (m[k].jenisPakan === feed && m[k].pakanKg) s += m[k].pakanKg; });
  return s;
}
function feedIn_(rows, date, feed) {
  var s = 0;
  rows.forEach(function (r) { if (r.type === 'pakan_masuk' && r.date === date && r.payload.jenis === feed) s += r.payload.qty || 0; });
  return s;
}
function obatOut_(rows, date, name) {
  var n = norm_(name), m = latestMap_(rows, date), s = 0;
  Object.keys(m).forEach(function (k) { (m[k].obat || []).forEach(function (x) { if (norm_(x.nama) === n) s += x.qty; }); });
  return s;
}
function obatIn_(rows, date, name) {
  var n = norm_(name), s = 0;
  rows.forEach(function (r) { if (r.type === 'obat_masuk' && r.date === date && norm_(r.payload.stokItem) === n) s += r.payload.stokQty || 0; });
  return s;
}

/** Tulis nilai turunan ke sel. Jika sel berisi angka manual (bukan nilai lama kita) → dilewati + peringatan. */
function writeDerived_(rg, oldVal, newVal, ctx, label) {
  var cur = rg.getValue();
  var curN = (cur === '' || cur === null) ? null : Number(cur);
  var eq = function (a, b) { return Math.abs(a - b) < 1e-9; };
  if (curN !== null && !isNaN(curN) && !eq(curN, oldVal || 0) && !eq(curN, newVal || 0)) {
    ctx.warn.push(label + ': sel ' + rg.getA1Notation() + ' sudah berisi ' + cur + ' (manual) — tidak ditimpa.');
    return 'dilewati, sel ' + rg.getA1Notation() + ' terisi manual';
  }
  if (!newVal) {
    if (curN === null) return 'sel ' + rg.getA1Notation() + ' kosong';
    rg.clearContent();
    return 'sel ' + rg.getA1Notation() + ' dikosongkan';
  }
  rg.setValue(newVal);
  return 'sel ' + rg.getA1Notation() + ' = ' + newVal;
}

function syncFeed_(date, feed, ctx) {
  var f = APP.FEEDS[feed];
  var sh = sheet_(file_('PAKAN'), f.sheet);
  var masukNew = feedIn_(ctx.after, date, feed), keluarNew = feedOut_(ctx.after, date, feed);
  var masukOld = feedIn_(ctx.before, date, feed), keluarOld = feedOut_(ctx.before, date, feed);
  var row = findDateRow_(sh, f.col, date, 4);
  if (row < 0) {
    if (!masukNew && !keluarNew) return 'tidak ada perubahan';
    row = extendFeedRows_(sh, f.col, date);
  }
  var a = writeDerived_(sh.getRange(row, f.col + 2), masukOld, masukNew, ctx, 'Stok ' + feed + ' MASUK');
  var b = writeDerived_(sh.getRange(row, f.col + 3), keluarOld, keluarNew, ctx, 'Stok ' + feed + ' KELUAR');
  return 'baris ' + row + ' (masuk: ' + a + '; keluar: ' + b + ')';
}

/** Sheet stok pakan = 1 baris per hari. Bila tanggal baru melewati baris terakhir, lanjutkan baris harian + rumus SISA. */
function extendFeedRows_(sh, c0, date) {
  var ss = sh.getParent(), tz = ss.getSpreadsheetTimeZone();
  var last = sh.getLastRow();
  var v = sh.getRange(1, c0, last, 1).getValues();
  var lr = 0;
  for (var i = 0; i < v.length; i++) if (isDate_(v[i][0])) lr = i + 1;
  if (lr < 4) throw new Error('format sheet ' + sh.getName() + ' tidak dikenali');
  var lastDate = ymd_(v[lr - 1][0], tz);
  if (date < lastDate) throw new Error('tanggal ' + date + ' tidak ada di sheet ' + sh.getName() + ' (baris harian bolong)');
  var n = daysBetween_(lastDate, date);
  if (n > 400) throw new Error('selisih tanggal terlalu jauh dari baris terakhir (' + n + ' hari)');
  var below = sh.getRange(lr + 1, c0, n, 5).getValues();
  if (below.some(function (r) { return r.some(function (x) { return x !== '' && x !== null; }); })) {
    throw new Error('baris di bawah data terakhir sheet ' + sh.getName() + ' tidak kosong — perpanjangan otomatis dibatalkan');
  }
  sh.getRange(lr, c0, 1, 5).copyTo(sh.getRange(lr + 1, c0, n, 5));
  var dates = [], blanks = [];
  for (var d = 1; d <= n; d++) { dates.push([dateFor_(ss, addDays_(lastDate, d))]); blanks.push(['']); }
  sh.getRange(lr + 1, c0, n, 1).setValues(dates);
  sh.getRange(lr + 1, c0 + 2, n, 1).clearContent();
  sh.getRange(lr + 1, c0 + 3, n, 1).clearContent();
  return lr + n;
}

/* ---------- Stok obat (blok per bulan) ---------- */
function obatBlocks_(sh) {
  var last = sh.getLastRow();
  var A = sh.getRange(1, 1, last, 3).getValues();
  var blocks = [];
  for (var i = 0; i < A.length; i++) {
    if (String(A[i][0]).trim().toUpperCase().indexOf('STOK OBAT') === 0) blocks.push({ row: i + 1, month: String(A[i][2]).trim().toUpperCase() });
  }
  blocks.forEach(function (b, i) { b.end = i + 1 < blocks.length ? blocks[i + 1].row - 1 : last; });
  return blocks;
}

function obatList_() {
  var y = Utilities.formatDate(new Date(), APP.TZ, 'yyyy'), cache = CacheService.getScriptCache(), key = 'obatList:' + y;
  var hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var sh = sheet_(file_('OBAT'), 'STOK ' + y);
  var b = obatBlocks_(sh)[0];
  var v = sh.getRange(b.row + 4, 1, b.end - b.row - 3, 2).getValues();
  var list = v.filter(function (r) { return String(r[0]).trim() !== ''; }).map(function (r) { return { nama: String(r[0]).trim(), satuan: String(r[1]).trim() }; });
  if (list.length) { try { cache.put(key, JSON.stringify(list), 300); } catch (e) {} }
  return list;
}

function ensureObatBlock_(sh, mo) {
  var blocks = obatBlocks_(sh), want = APP.MONTHS[mo - 1];
  for (var i = 0; i < blocks.length; i++) if (blocks[i].month === want) return blocks[i];
  if (!blocks.length) throw new Error('sheet ' + sh.getName() + ' tidak punya blok "STOK OBAT KANDANG"');
  var lastB = blocks[blocks.length - 1];
  var lastIdx = APP.MONTHS.indexOf(lastB.month);
  if (lastIdx < 0 || mo - 1 <= lastIdx) throw new Error('blok bulan ' + want + ' tidak ada di ' + sh.getName());
  var len = lastB.end - lastB.row + 1, cur = lastB;
  for (var m = lastIdx + 1; m <= mo - 1; m++) {
    var ns = cur.row + APP.OBAT_BLOCK_GAP, need = ns + len - 1;
    if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    sh.getRange(cur.row, 1, len, 49).copyTo(sh.getRange(ns, 1, len, 49));
    sh.getRange(ns, 3).setValue(APP.MONTHS[m]);
    APP.OBAT_WEEK_START.forEach(function (s) { sh.getRange(ns + 4, s, len - 4, 7).clearContent(); });
    var names = sh.getRange(cur.row, 1, len, 1).getValues();
    for (var off = 4; off < len; off++) {
      if (String(names[off][0]).trim() !== '') sh.getRange(ns + off, 3).setFormula('=AV' + (cur.row + off));   // stok awal = stok akhir bulan lalu
    }
    cur = { row: ns, month: APP.MONTHS[m], end: ns + len - 1 };
  }
  return cur;
}

function syncObat_(date, name, ctx) {
  var p = parseYmd_(date);
  var sh = sheet_(file_('OBAT'), 'STOK ' + p.y);
  var b = ensureObatBlock_(sh, p.mo);
  var A = sh.getRange(b.row + 4, 1, b.end - b.row - 3, 1).getValues();
  var row = -1, n = norm_(name);
  for (var i = 0; i < A.length; i++) if (norm_(A[i][0]) === n) { row = b.row + 4 + i; break; }
  if (row < 0) throw new Error('obat "' + name + '" tidak ada di daftar STOK ' + p.y + ' (tambahkan dulu barisnya)');
  var col = obatCol_(p.d);
  var oldNet = obatIn_(ctx.before, date, name) - obatOut_(ctx.before, date, name);
  var newNet = obatIn_(ctx.after, date, name) - obatOut_(ctx.after, date, name);
  return writeDerived_(sh.getRange(row, col), oldNet, newNet, ctx, 'Stok obat ' + name);   // keluar = angka negatif
}
function obatCol_(d) { return APP.OBAT_WEEK_START[Math.floor((d - 1) / 7)] + ((d - 1) % 7); }

/* ================================================================
 *  HELPER SHEET
 * ================================================================ */
var _files = {};
function master_() {
  var ss = getMasterSpreadsheet_();
  if (ss) return ss;
  throw new Error('Belum setup: MASTER_ID belum disetel. Buka file Google Sheets Anda lalu klik [Ekstensi] > [Apps Script] dan jalankan setup(), atau gunakan setMasterSpreadsheetId("ID_SPREADSHEET").');
}
function file_(key) {
  if (_files[key]) return _files[key];
  var v = master_().getSheetByName(APP.SHEET_CONFIG).getDataRange().getValues(), val = '';
  for (var i = 1; i < v.length; i++) if (v[i][0] === key) val = String(v[i][2] || '');
  var m = val.match(/[-\w]{25,}/);
  if (!m) throw new Error('CONFIG ' + key + ' belum diisi');
  return (_files[key] = SpreadsheetApp.openById(m[0]));
}
function sheet_(ss, name) {
  var t = String(name).trim().toLowerCase(), all = ss.getSheets();
  for (var i = 0; i < all.length; i++) if (all[i].getName().trim().toLowerCase() === t) return all[i];
  throw new Error('sheet "' + name + '" tidak ada di ' + ss.getName());
}
function norm_(s) { return String(s === null || s === undefined ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
function isDate_(x) { return Object.prototype.toString.call(x) === '[object Date]' && !isNaN(x.getTime()); }
function ymd_(d, tz) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }
function parseYmd_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) throw new Error('Tanggal tidak valid: ' + s);
  return { y: +m[1], mo: +m[2], d: +m[3] };
}
function dateFor_(ss, s) { return Utilities.parseDate(s, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd'); }
function addDays_(s, n) { var p = parseYmd_(s); return Utilities.formatDate(new Date(Date.UTC(p.y, p.mo - 1, p.d + n)), 'UTC', 'yyyy-MM-dd'); }
function daysBetween_(a, b) { var p = parseYmd_(a), q = parseYmd_(b); return Math.round((Date.UTC(q.y, q.mo - 1, q.d) - Date.UTC(p.y, p.mo - 1, p.d)) / 86400000); }
function colA_(n) { var s = ''; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

function findDateRow_(sh, col, dateStr, startRow) {
  var n = sh.getLastRow() - startRow + 1;
  if (n < 1) return -1;
  var tz = sh.getParent().getSpreadsheetTimeZone();
  var v = sh.getRange(startRow, col, n, 1).getValues();
  for (var i = 0; i < n; i++) if (isDate_(v[i][0]) && ymd_(v[i][0], tz) === dateStr) return startRow + i;
  return -1;
}

/** Baris kosong pertama (mulai startRow) di mana semua kolom `cols` kosong. */
function firstFree_(sh, startRow, cols, width, fromCol) {
  var c0 = fromCol || 1, last = Math.max(sh.getLastRow(), startRow);
  var v = sh.getRange(startRow, c0, last - startRow + 1, width - c0 + 1).getValues();
  for (var i = 0; i < v.length; i++) {
    var free = cols.every(function (c) { return v[i][c - c0] === '' || v[i][c - c0] === null; });
    if (free) return startRow + i;
  }
  return last + 1;
}

/** Tulis sel input saja. null/undefined = lewati; '' = kosongkan (kecuali sel rumus). Rumus tidak ditimpa dengan kosong. */
function writeRow_(sh, row, map, ctx, label) {
  var cols = Object.keys(map).map(Number);
  if (!cols.length) return;
  var maxC = Math.max.apply(null, cols);
  var rg = sh.getRange(row, 1, 1, maxC);
  var vals = rg.getValues()[0], forms = rg.getFormulas()[0];
  cols.forEach(function (c) {
    var v = map[c];
    if (v === null || v === undefined) return;
    var hasF = !!forms[c - 1], old = vals[c - 1];
    if (v === '' && hasF) return;
    if (!hasF && old !== '' && old !== null && String(old) !== String(v) && ctx) {
      ctx.warn.push(label + ' ' + colA_(c) + row + ': nilai lama ' + old + ' diganti ' + (v === '' ? '(kosong)' : v));
    }
    sh.getRange(row, c).setValue(v);
  });
}

function latestFeedPrice_(feed, date) {
  var sh = sheet_(file_('PAKAN'), 'NOTA PAKAN');
  var last = sh.getLastRow();
  if (last < 3) return null;
  var tz = sh.getParent().getSpreadsheetTimeZone();
  var v = sh.getRange(3, 1, last - 2, 6).getValues();
  var want = norm_(APP.FEEDS[feed].nota), cur = '', best = null;
  v.forEach(function (r) {
    if (isDate_(r[0])) cur = ymd_(r[0], tz);
    if (norm_(r[3]) === want && r[5] !== '' && !isNaN(Number(r[5])) && cur && cur <= date) best = Number(r[5]);
  });
  return best;
}

/* ================================================================
 *  DB_INPUT
 * ================================================================ */
function db_() {
  var sh = master_().getSheetByName(APP.SHEET_DB);
  if (!sh) throw new Error('Sheet DB_INPUT tidak ada — jalankan Setup awal');
  return sh;
}
function appendDb_(e, petugas) {
  var sh = db_();
  sh.appendRow([new Date(), txt_(petugas, 40), e.type, e.date, e.kandang, e.id, JSON.stringify(e.payload), 'PROSES', '']);
  return sh.getLastRow();
}
function dbRows_() {
  var sh = db_(), total = sh.getLastRow() - 1, n = Math.min(total, APP.DB_WINDOW);
  if (n < 1) return [];
  var first = sh.getLastRow() - n + 1, tz = master_().getSpreadsheetTimeZone();
  return sh.getRange(first, 1, n, 9).getValues().map(function (r, i) {
    var p = {};
    try { p = JSON.parse(r[6] || '{}'); } catch (e) { p = {}; }
    return { row: first + i, type: r[2], date: isDate_(r[3]) ? ymd_(r[3], tz) : String(r[3]), kandang: r[4], id: String(r[5]), payload: p, status: r[7], time: r[0], petugas: r[1], msg: r[8] };
  });
}

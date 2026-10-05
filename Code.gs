const SHEETS = {
  admins: ["email","passwordHash","active","createdAt"],
  users: ["id","name","email","balance","createdAt"],
  deposits: ["id","email","bank","amount","reference","status","createdAt","reviewedAt","reviewedBy"],
  withdrawals: ["id","email","bank","accountNumber","accountHolder","amount","note","status","createdAt","reviewedAt","reviewedBy"],
  notifications: ["email","title","message","createdAt"]
};

function setupTrivAdmin() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function(name) {
    let s = ss.getSheetByName(name);
    if (!s) {
      s = ss.insertSheet(name);
      s.appendRow(SHEETS[name]);
    }
  });

  // Ganti email dan password di bawah sebelum menjalankan fungsi ini.
  const adminEmail = "admin@triv.web.id";
  const adminPassword = "TrivAdmin@2026!";
  const s = ss.getSheetByName("admins");
  const existing = getRows_("admins").find(r => String(r[0]).toLowerCase() === adminEmail.toLowerCase());
  if (!existing) {
    s.appendRow([adminEmail, sha256_(adminPassword), "ACTIVE", new Date()]);
  }
}

function doGet(e) {
  setupSheets_();
  const p = e.parameter || {};
  const action = p.action || "";
  const cb = p.callback || "";
  try {
    let result;

    if (action === "admin_login") {
      result = adminLogin_(p.email, p.passwordHash);
    } else if (action === "admin_data") {
      result = adminData_(p.session);
    } else if (action === "admin_review") {
      result = adminReview_(p.session, p.type, p.id, p.decision);
    } else if (action === "admin_logout") {
      result = {ok:true};
    } else {
      result = {ok:false, error:"Aksi tidak dikenal"};
    }

    return json_(result, cb);
  } catch (err) {
    return json_({ok:false, error:String(err)}, cb);
  }
}

function adminLogin_(email, passwordHash) {
  email = String(email || "").trim().toLowerCase();
  const row = getRows_("admins").find(r =>
    String(r[0]).toLowerCase() === email &&
    String(r[1]) === String(passwordHash || "") &&
    String(r[2]) === "ACTIVE"
  );
  if (!row) return {ok:false, error:"Email atau password admin salah"};

  const token = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(
    "ADMIN_SESSION_" + token,
    JSON.stringify({email:email, expires:Date.now()+8*60*60*1000})
  );
  return {ok:true, session:token, email:email};
}

function adminData_(token) {
  const admin = checkAdmin_(token);
  if (!admin) return {ok:false, error:"Sesi admin tidak valid atau sudah berakhir"};

  const deposits = getRows_("deposits")
    .filter(r => String(r[5]) === "PENDING")
    .map(r => ({
      id:String(r[0]), email:String(r[1]), bank:String(r[2]),
      amount:Number(r[3]) || 0, reference:String(r[4] || ""),
      createdAt:String(r[6] || "")
    }));

  const withdrawals = getRows_("withdrawals")
    .filter(r => String(r[7]) === "PENDING")
    .map(r => ({
      id:String(r[0]), email:String(r[1]), bank:String(r[2]),
      accountNumber:String(r[3] || ""), accountHolder:String(r[4] || ""),
      amount:Number(r[5]) || 0, note:String(r[6] || ""),
      createdAt:String(r[8] || "")
    }));

  return {
    ok:true,
    admin:admin.email,
    deposits:deposits.reverse(),
    withdrawals:withdrawals.reverse()
  };
}

function adminReview_(token, type, id, decision) {
  const admin = checkAdmin_(token);
  if (!admin) return {ok:false, error:"Sesi admin tidak valid"};

  if (!["deposit","withdrawal"].includes(String(type))) {
    return {ok:false, error:"Jenis transaksi tidak valid"};
  }
  if (!["approve","reject"].includes(String(decision))) {
    return {ok:false, error:"Keputusan tidak valid"};
  }

  const sheetName = type === "deposit" ? "deposits" : "withdrawals";
  const rows = getRows_(sheetName);
  const index = rows.findIndex(r => String(r[0]) === String(id));
  if (index < 0) return {ok:false, error:"Transaksi tidak ditemukan"};

  const rowNumber = index + 2;
  const row = rows[index];
  const statusColumn = type === "deposit" ? 6 : 8;
  const reviewedAtColumn = type === "deposit" ? 8 : 10;
  const reviewedByColumn = type === "deposit" ? 9 : 11;

  if (String(row[statusColumn-1]) !== "PENDING") {
    return {ok:false, error:"Transaksi sudah diproses"};
  }

  const newStatus = decision === "approve" ? "APPROVED" : "REJECTED";
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  sheet.getRange(rowNumber, statusColumn).setValue(newStatus);
  sheet.getRange(rowNumber, reviewedAtColumn).setValue(new Date());
  sheet.getRange(rowNumber, reviewedByColumn).setValue(admin.email);

  const memberEmail = String(row[1]);

  if (type === "deposit" && decision === "approve") {
    changeBalance_(memberEmail, Number(row[3]) || 0);
    notify_(memberEmail, "Deposit disetujui",
      "Deposit Rp " + money_(row[3]) + " telah disetujui admin.");
  } else if (type === "deposit" && decision === "reject") {
    notify_(memberEmail, "Deposit ditolak",
      "Deposit Rp " + money_(row[3]) + " ditolak admin.");
  } else if (type === "withdrawal" && decision === "approve") {
    notify_(memberEmail, "Withdraw disetujui",
      "Permintaan WD Rp " + money_(row[5]) + " telah disetujui admin.");
  } else if (type === "withdrawal" && decision === "reject") {
    // Dana WD diasumsikan sudah ditahan saat permintaan dibuat.
    changeBalance_(memberEmail, Number(row[5]) || 0);
    notify_(memberEmail, "Withdraw ditolak",
      "Permintaan WD Rp " + money_(row[5]) + " ditolak. Dana dikembalikan ke saldo.");
  }

  return {ok:true, status:newStatus};
}

function changeBalance_(email, delta) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("users");
  const rows = getRows_("users");
  const i = rows.findIndex(r => String(r[2]).toLowerCase() === String(email).toLowerCase());
  if (i < 0) throw new Error("Member tidak ditemukan: " + email);
  const current = Number(rows[i][3]) || 0;
  sheet.getRange(i+2, 4).setValue(current + Number(delta));
}

function notify_(email, title, message) {
  SpreadsheetApp.getActive().getSheetByName("notifications")
    .appendRow([email,title,message,new Date()]);
}

function checkAdmin_(token) {
  if (!token) return null;
  const key = "ADMIN_SESSION_" + token;
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return null;
  const s = JSON.parse(raw);
  if (!s.expires || Date.now() > Number(s.expires)) {
    PropertiesService.getScriptProperties().deleteProperty(key);
    return null;
  }
  return {email:s.email};
}

function setupSheets_() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function(name) {
    let s = ss.getSheetByName(name);
    if (!s) {
      s = ss.insertSheet(name);
      s.appendRow(SHEETS[name]);
    }
  });
}

function getRows_(name) {
  const s = SpreadsheetApp.getActive().getSheetByName(name);
  if (!s || s.getLastRow() < 2) return [];
  const values = s.getDataRange().getValues();
  values.shift();
  return values;
}

function sha256_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");
}

function money_(n) {
  return Number(n || 0).toLocaleString("id-ID");
}

function json_(obj, cb) {
  const body = JSON.stringify(obj);
  if (cb) {
    return ContentService
      .createTextOutput(cb + "(" + body + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

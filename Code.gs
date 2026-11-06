/**
 * Google Apps Script Backend: "BINGKAI BISU - Fixlens Festival 2026"
 * 
 * Melayani:
 * 1. Form Pemesanan Publik (Simpan ke Sheets & Upload Bukti Transfer ke Drive)
 * 2. Cek Status & Unduh E-Ticket (action: "check_ticket", verifikasi ganda WA + Nama)
 * 3. Dashboard Admin - Ambil Antrean Pending (action: "admin_get_pending")
 * 4. Dashboard Admin - ACC & Terbitkan Tiket (action: "admin_acc")
 * 5. Gate Scanner Offline - Unduh Database (action: "download_offline_db")
 * 6. Gate Scanner Offline - Sinkronkan Hasil Scan (action: "sync_offline_checkins")
 */

var SHEET_NAME = "Pesanan Tiket";
var DRIVE_FOLDER_BUKTI = "Bukti Transfer Bingkai Bisu 2026";

/**
 * Handle POST Request (Format JSON via text/plain agar bebas hambatan CORS)
 */
function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var payload = JSON.parse(rawData);
    var action = payload.action;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();

    // ==========================================
    // ACTION 1: ADMIN - AMBIL ANTREAN PENDING
    // ==========================================
    if (action === "admin_get_pending") {
      var data = sheet.getDataRange().getValues();
      var pendingList = [];

      // Format kolom: [0]Timestamp, [1]KodeTiket, [2]Nama, [3]WhatsApp, [4]Varian, [5]Jumlah, [6]Total, [7]BuktiUrl, [8]Status, [9]LinkPdf
      for (var i = 1; i < data.length; i++) {
        var rowStatus = (data[i][8] || "PENDING").toString().toUpperCase().trim();
        if (rowStatus === "PENDING") {
          var fileBukti = data[i][7] || "-";
          pendingList.push({
            rowIndex: i + 1, // Baris 1-indexed untuk SpreadsheetApp
            waktu: data[i][0] ? data[i][0].toString() : "-",
            timestamp: data[i][0] ? data[i][0].toString() : "-",
            kodeTiket: data[i][1] || ("#BB26-" + (i + 100)),
            ticketCode: data[i][1] || ("#BB26-" + (i + 100)),
            nama: data[i][2] || "-",
            whatsapp: (data[i][3] || "").toString().replace(/['\s-]/g, ""),
            varian: data[i][4] || "2 Day Pass",
            jumlah: data[i][5] || 1,
            total: data[i][6] || 0,
            linkBukti: fileBukti,
            fileUrl: fileBukti
          });
        }
      }

      return createJsonResponse({ status: "SUCCESS", data: pendingList });
    }

    // ==========================================
    // ACTION 2: ADMIN - ACC & TERBITKAN TIKET
    // ==========================================
    if (action === "admin_acc") {
      var targetRow = parseInt(payload.rowIndex, 10);
      if (!targetRow || targetRow < 2) {
        return createJsonResponse({ status: "error", message: "Nomor baris tidak valid." });
      }

      // Update kolom status pembayaran (Kolom I / index 9) menjadi "APPROVED"
      sheet.getRange(targetRow, 9).setValue("APPROVED");

      // Cek apakah link PDF sudah ada di Kolom J / index 10
      var currentPdf = sheet.getRange(targetRow, 10).getValue();
      if (!currentPdf || currentPdf.toString().trim() === "") {
        sheet.getRange(targetRow, 10).setValue("https://drive.google.com");
      }

      return createJsonResponse({
        status: "SUCCESS",
        message: "Tiket pada baris " + targetRow + " berhasil disetujui (APPROVED)."
      });
    }

    // ==========================================
    // ACTION 3: PUBLIK - CEK STATUS & UNDUH (VERIFIKASI GANDA WA + NAMA)
    // ==========================================
    if (action === "check_ticket") {
      var waQuery = (payload.whatsapp || "").toString().trim().replace(/['\s-]/g, "");
      var nameQuery = (payload.nama || "").toString().trim().toLowerCase();
      var allData = sheet.getDataRange().getValues();

      if (allData.length <= 1) {
        return createJsonResponse({ status: "NOT_FOUND", found: false, message: "Belum ada data tiket." });
      }

      // Cari data dari baris terbaru ke lama
      for (var r = allData.length - 1; r >= 1; r--) {
        var rowWa = (allData[r][3] || "").toString().trim().replace(/['\s-]/g, "");
        var rowName = (allData[r][2] || "").toString().trim().toLowerCase();

        var cleanRowWa = rowWa.replace(/^0/, "62");
        var cleanQueryWa = waQuery.replace(/^0/, "62");

        var waMatch = (cleanRowWa === cleanQueryWa || rowWa === waQuery);
        var nameMatch = !nameQuery || rowName.includes(nameQuery) || nameQuery.includes(rowName);

        if (waMatch && nameMatch) {
          var paymentStatus = (allData[r][8] || "PENDING").toString().toUpperCase().trim();
          var linkPdf = (allData[r][9] || "").toString().trim();
          var ticketCode = allData[r][1] || ("#BB26-" + waQuery.slice(-4));

          return createJsonResponse({
            status: "FOUND",
            statusBayar: paymentStatus,
            found: true,
            kodeTiket: ticketCode,
            ticketCode: ticketCode,
            nama: allData[r][2],
            varian: allData[r][4],
            jumlah: allData[r][5],
            total: allData[r][6],
            linkPdf: linkPdf || "https://drive.google.com",
            pdfUrl: linkPdf || "https://drive.google.com"
          });
        }
      }

      return createJsonResponse({ status: "NOT_FOUND", found: false, message: "Nomor WhatsApp dan Nama tidak cocok." });
    }

    // Helper Merchandise sesuai varian tiket
    function getMerchFromVariant(variantName) {
      var v = (variantName || "").toString().toLowerCase();
      if (v.includes("ganci") || (v.includes("bundling") && v.includes("stiker"))) {
        return { ada: true, item: "1x Stiker + 1x Gantungan Kunci Fixlens" };
      } else if (v.includes("stiker")) {
        return { ada: true, item: "1x Stiker Eksklusif" };
      }
      return { ada: false, item: "" };
    }

    // ==========================================
    // ACTION: CEK KUOTA BUNDLING 10K (MAKS. 95 SLOT)
    // ==========================================
    if (action === "get_quota") {
      var allRows = sheet.getDataRange().getValues();
      var bundlingBooked = 0;
      var BUNDLING_MAX = 95;

      for (var b = 1; b < allRows.length; b++) {
        var vName = (allRows[b][4] || "").toString().toLowerCase();
        var payStatus = (allRows[b][8] || "PENDING").toString().toUpperCase().trim();
        if (vName.includes("bundling") || vName.includes("ganci") || vName.includes("10.000") || vName.includes("10k")) {
          if (payStatus !== "REJECTED" && payStatus !== "BATAL") {
            var qty = parseInt(allRows[b][5], 10) || 1;
            bundlingBooked += qty;
          }
        }
      }

      var remaining = Math.max(0, BUNDLING_MAX - bundlingBooked);
      return createJsonResponse({
        status: "SUCCESS",
        quotaBundling: {
          total: BUNDLING_MAX,
          booked: bundlingBooked,
          remaining: remaining,
          isSoldOut: remaining <= 0
        }
      });
    }

    // ==========================================
    // ACTION 5: GATE SCANNER - UNDUH DATABASE OFFLINE
    // ==========================================
    if (action === "download_offline_db") {
      var allRows = sheet.getDataRange().getValues();
      var offlineList = [];

      for (var k = 1; k < allRows.length; k++) {
        var payStat = (allRows[k][8] || "PENDING").toString().toUpperCase().trim();
        // Hanya tiket yang APPROVED atau jika diinginkan semua tiket
        if (payStat === "APPROVED") {
          var varName = allRows[k][4] || "Tiket 2 Hari (Reguler)";
          offlineList.push({
            kodeTiket: (allRows[k][1] || "").toString().trim().toUpperCase(),
            nama: allRows[k][2] || "-",
            whatsapp: (allRows[k][3] || "").toString().replace(/['\s-]/g, ""),
            varian: varName,
            jumlah: allRows[k][5] || 1,
            statusBayar: payStat,
            merch: getMerchFromVariant(varName),
            statusCheckin: (allRows[k][10] || "BELUM MASUK").toString().toUpperCase().trim(), // Kolom K
            waktuScan: (allRows[k][11] || "").toString().trim() // Kolom L
          });
        }
      }

      return createJsonResponse({
        status: "SUCCESS",
        count: offlineList.length,
        tickets: offlineList
      });
    }

    // ==========================================
    // ACTION 6: GATE SCANNER - SINKRONKAN HASIL SCAN
    // ==========================================
    if (action === "sync_offline_checkins") {
      var checkinList = payload.checkins || [];
      var allRows = sheet.getDataRange().getValues();
      var updatedCount = 0;

      // Buat header check-in jika kolom K dan L belum ada
      if (allRows.length > 0 && allRows[0].length < 12) {
        sheet.getRange(1, 11).setValue("Status Check-In");
        sheet.getRange(1, 12).setValue("Waktu Scan");
      }

      checkinList.forEach(function(item) {
        var targetCode = (item.kodeTiket || "").toString().trim().toUpperCase();
        for (var rowIdx = 1; rowIdx < allRows.length; rowIdx++) {
          var currentCode = (allRows[rowIdx][1] || "").toString().trim().toUpperCase();
          if (currentCode === targetCode || currentCode.replace("#", "") === targetCode.replace("#", "")) {
            sheet.getRange(rowIdx + 1, 11).setValue("SUDAH MASUK");
            sheet.getRange(rowIdx + 1, 12).setValue(item.waktuScan || new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
            updatedCount++;
            break;
          }
        }
      });

      return createJsonResponse({
        status: "SUCCESS",
        message: "Berhasil menyinkronkan " + updatedCount + " data check-in tiket ke Cloud."
      });
    }

    // ==========================================
    // ACTION 4: PUBLIK - PEMESANAN TIKET BARU (submit_order)
    // ==========================================
    if (action === "submit_order" || !action) {
      if (sheet.getLastRow() === 0) {
        sheet.appendRow([
          "Timestamp",
          "Kode Tiket",
          "Nama Lengkap",
          "Nomor WhatsApp",
          "Varian Tiket",
          "Jumlah Tiket",
          "Total Pembayaran",
          "Link Bukti Transfer (Drive)",
          "Status Pembayaran",
          "Link PDF E-Ticket",
          "Status Check-In",
          "Waktu Scan"
        ]);

        var headerRange = sheet.getRange(1, 1, 1, 12);
        headerRange.setFontWeight("bold");
        headerRange.setBackground("#B8A9E3");
        headerRange.setFontColor("#0F0F14");
      }

      // Buat Kode Tiket Unik (#BB26-XXXX)
      var ticketCode = "#BB26-" + Math.floor(1000 + Math.random() * 9000);

      // Proses Simpan Bukti Transfer ke Google Drive
      var fileUrl = "-";
      if (payload.fileData) {
        try {
          var decodedBytes = Utilities.base64Decode(payload.fileData);
          var mimeType = "image/jpeg";
          var fileName = payload.namaFile || "bukti.jpg";

          if (fileName.toLowerCase().endsWith(".png")) mimeType = "image/png";
          if (fileName.toLowerCase().endsWith(".webp")) mimeType = "image/webp";

          var blob = Utilities.newBlob(decodedBytes, mimeType, "Bukti_" + payload.whatsapp + "_" + fileName);

          var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_BUKTI);
          var targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_BUKTI);

          var uploadedFile = targetFolder.createFile(blob);
          uploadedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          fileUrl = uploadedFile.getUrl();
        } catch (fileErr) {
          fileUrl = "Error upload file: " + fileErr.toString();
        }
      }

      // Tambah baris baru ke Sheet (Default: PENDING)
      sheet.appendRow([
        new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
        ticketCode,
        payload.nama,
        "'" + payload.whatsapp,
        payload.varian,
        payload.jumlah,
        payload.total,
        fileUrl,
        "PENDING",
        "",
        "BELUM MASUK",
        ""
      ]);

      return createJsonResponse({
        status: "SUCCESS",
        message: "Data pemesanan dan bukti pembayaran berhasil disimpan!",
        ticketCode: ticketCode
      });
    }

    return createJsonResponse({ status: "error", message: "Action tidak dikenal: " + action });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Handle GET Request
 */
function doGet(e) {
  return createJsonResponse({
    status: "alive",
    message: "Backend Sistem Tiket Bingkai Bisu 2026 aktif."
  });
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * admin.js — Logika Frontend Dashboard Admin
 * Bingkai Bisu • Fixlens Festival 2026
 * Mencakup: validasi PIN dinamis, pemuatan antrean pending,
 *            fungsi ACC tiket, preview struk, scanner gate.
 */

// ============================================================
// KONFIGURASI ENDPOINT
// ============================================================
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwRMLG227dO9VkqJh__-Prb6HGw_t1JMY14FLLeQHO6kMwq5jlClzXlkMTfMYOh31zw/exec";

// ============================================================
// HELPER: SANITASI XSS (DOM-BASED)
// ============================================================
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============================================================
// STATE APLIKASI ADMIN
// ============================================================
let currentTab = "pending"; // 'pending' | 'approved'
let pendingOrdersList = [];
let approvedOrdersList = [];
let currentReceiptItem = null;
let html5QrScanner = null;

// ============================================================
// HELPER: FORMAT RUPIAH
// ============================================================
function formatRupiah(amount) {
  const num = parseInt(amount, 10);
  if (isNaN(num)) return "Rp 0";
  return "Rp " + num.toLocaleString("id-ID");
}

// ============================================================
// 1. VALIDASI SESI MASUK MULTI-ADMIN (SESSION STORAGE "adminUser" & "adminPass")
// ============================================================
function checkSessionAuth() {
  const savedUser = (sessionStorage.getItem("adminUser") || "").trim();
  const savedPass = (sessionStorage.getItem("adminPass") || "").trim();
  const savedName = (sessionStorage.getItem("adminName") || "").trim();
  const pinModal = document.getElementById("pinAuthModal");
  const dashboard = document.getElementById("mainDashboard");
  const badge = document.getElementById("activeAdminNameBadge");

  if (savedUser && savedPass) {
    if (pinModal) pinModal.classList.add("hidden");
    if (dashboard) dashboard.classList.remove("hidden");
    if (badge) badge.textContent = savedName || savedUser;
    loadOrdersData();
  } else {
    if (pinModal) pinModal.classList.remove("hidden");
    if (dashboard) dashboard.classList.add("hidden");
    setTimeout(() => {
      const input = document.getElementById("inputAdminUsername");
      if (input) input.focus();
    }, 150);
  }
  if (window.lucide) lucide.createIcons();
}

function toggleAdminPasswordVisibility() {
  const passInput = document.getElementById("inputAdminPassword");
  const icon = document.getElementById("iconTogglePassword");
  if (!passInput) return;
  if (passInput.type === "password") {
    passInput.type = "text";
    if (icon) icon.setAttribute("data-lucide", "eye-off");
  } else {
    passInput.type = "password";
    if (icon) icon.setAttribute("data-lucide", "eye");
  }
  if (window.lucide) lucide.createIcons();
}
window.toggleAdminPasswordVisibility = toggleAdminPasswordVisibility;

async function handleAdminLogin(e) {
  e.preventDefault();
  const userInput = document.getElementById("inputAdminUsername");
  const passInput = document.getElementById("inputAdminPassword");
  const err = document.getElementById("loginErrorMsg");
  const container = document.getElementById("pinModalContainer");
  const btn = document.getElementById("btnLoginSubmit");

  const username = (userInput ? userInput.value : "").trim();
  const password = (passInput ? passInput.value : "").trim();

  if (!username || !password) {
    if (err) {
      err.textContent = "Harap masukkan username dan password!";
      err.classList.remove("hidden");
    }
    return;
  }

  const origBtnHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="animate-spin h-4 w-4 text-[#2D2A1A]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      <span>Memverifikasi...</span>
    `;
  }

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "admin_login",
        username: username,
        password: password
      })
    }).then(r => r.json());

    if (res && res.status === "SUCCESS") {
      sessionStorage.setItem("adminUser", res.adminUser || username);
      sessionStorage.setItem("adminPass", password);
      sessionStorage.setItem("adminName", res.adminName || username);
      sessionStorage.setItem("adminPin", password);

      if (err) err.classList.add("hidden");
      if (userInput) userInput.value = "";
      if (passInput) passInput.value = "";

      checkSessionAuth();
    } else {
      if (container) {
        container.classList.remove("animate-shake");
        void container.offsetWidth;
        container.classList.add("animate-shake");
      }
      if (err) {
        err.textContent = (res && res.message) ? res.message : "Username atau Password salah!";
        err.classList.remove("hidden");
      }
      if (passInput) {
        passInput.value = "";
        passInput.focus();
      }
    }
  } catch (netErr) {
    if (err) {
      err.textContent = "Kendala koneksi ke server: " + (netErr.message || netErr);
      err.classList.remove("hidden");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnHtml;
      if (window.lucide) lucide.createIcons();
    }
  }
}

// Fallback untuk backward compatibility jika dipanggil handlePinLogin
function handlePinLogin(e) {
  handleAdminLogin(e);
}

function handleLogout() {
  if (confirm("Kunci kembali dashboard admin?")) {
    sessionStorage.removeItem("adminUser");
    sessionStorage.removeItem("adminPass");
    sessionStorage.removeItem("adminName");
    sessionStorage.removeItem("adminPin");
    sessionStorage.clear();
    checkSessionAuth();
  }
}

// ============================================================
// 2. LOAD DATA DARI GOOGLE APPS SCRIPT
// ============================================================
async function loadOrdersData(isManual = false) {
  const icon = document.getElementById("iconRefresh");
  const tableLoading = document.getElementById("tableLoading");
  const savedUser = (sessionStorage.getItem("adminUser") || "").trim();
  const savedPass = (sessionStorage.getItem("adminPass") || "").trim();
  const savedName = (sessionStorage.getItem("adminName") || "").trim();

  if (!savedUser || !savedPass) {
    checkSessionAuth();
    return;
  }

  const badge = document.getElementById("activeAdminNameBadge");
  if (badge) badge.textContent = savedName || savedUser;

  if (icon) icon.classList.add("animate-spin");
  if (tableLoading) tableLoading.classList.remove("hidden");

  try {
    const pendingPromise = fetch(SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "admin_get_pending",
        username: savedUser,
        password: savedPass,
        adminName: savedName,
        pin: savedPass
      })
    }).then(r => r.json()).catch(() => ({ data: [] }));

    const approvedPromise = fetch(SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "admin_get_approved",
        username: savedUser,
        password: savedPass,
        adminName: savedName,
        pin: savedPass
      })
    }).then(r => r.json()).catch(() => ({ tickets: [] }));

    const quotaPromise = fetch(SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "get_quota" })
    }).then(r => r.json()).catch(() => ({ quotaBundling: { sisa: 100 } }));

    const [resPending, resApproved, resQuota] = await Promise.all([pendingPromise, approvedPromise, quotaPromise]);

    if ((resPending && resPending.status === "UNAUTHORIZED") || (resApproved && resApproved.status === "UNAUTHORIZED")) {
      const errMsg = (resPending && resPending.message) || (resApproved && resApproved.message) || "Sesi login berakhir. Silakan login kembali.";
      sessionStorage.removeItem("adminUser");
      sessionStorage.removeItem("adminPass");
      sessionStorage.removeItem("adminName");
      sessionStorage.removeItem("adminPin");
      sessionStorage.clear();
      
      const pinModal = document.getElementById("pinAuthModal");
      const dashboard = document.getElementById("mainDashboard");
      const err = document.getElementById("loginErrorMsg");
      const container = document.getElementById("pinModalContainer");
      const input = document.getElementById("inputAdminUsername");

      if (dashboard) dashboard.classList.add("hidden");
      if (pinModal) pinModal.classList.remove("hidden");
      if (err) {
        err.textContent = errMsg;
        err.classList.remove("hidden");
      }
      if (container) {
        container.classList.remove("animate-shake");
        void container.offsetWidth;
        container.classList.add("animate-shake");
      }
      if (input) {
        input.value = "";
        input.focus();
      }
      return;
    }

    pendingOrdersList = Array.isArray(resPending) ? resPending : (resPending.data || resPending.items || []);
    approvedOrdersList = Array.isArray(resApproved) ? resApproved : (resApproved.tickets || resApproved.data || []);

    // Update 4 Kartu Metrik KPI Resmi
    updateKpiMetrics(approvedOrdersList, resQuota);

    // Update Badge Tabs
    const badgePending = document.getElementById("badgePendingCount");
    const badgeApproved = document.getElementById("badgeApprovedCount");
    if (badgePending) badgePending.textContent = pendingOrdersList.length;
    if (badgeApproved) badgeApproved.textContent = approvedOrdersList.length;

    // Render Tabel
    renderCurrentTabTable();

    if (isManual) {
      showAccToast("Data terbaru berhasil dimuat ulang.", "success");
    }

  } catch (err) {
    console.error("Gagal load data orders:", err);
    const tbody = document.getElementById("tableBody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="py-8 text-center text-red-400">
            Gagal menghubungi server database Google Sheets. Periksa koneksi internet.
          </td>
        </tr>
      `;
    }
  } finally {
    if (tableLoading) tableLoading.classList.add("hidden");
    if (icon) icon.classList.remove("animate-spin");
    if (window.lucide) lucide.createIcons();
  }
}

// Helper alias untuk reload antrean
function loadPendingOrders() {
  return loadOrdersData();
}
function loadOrders() {
  return loadOrdersData();
}

// ============================================================
// 3. UPDATE 4 KARTU METRIK KPI
// ============================================================
function updateKpiMetrics(approvedList, quotaRes) {
  let totalApprovedTickets = 0;
  let totalRevenue = 0;
  let totalCheckedIn = 0;

  approvedList.forEach(item => {
    const qty = parseInt(item.jumlah, 10) || 1;
    totalApprovedTickets += qty;

    if (item.total && parseInt(item.total, 10)) {
      totalRevenue += parseInt(item.total, 10);
    } else {
      const v = (item.varian || "").toLowerCase();
      if (v.includes("10.000") || v.includes("bundling") || v.includes("ganci")) totalRevenue += (10000 * qty);
      else if (v.includes("8.000") || v.includes("stiker") || v.includes("2 hari")) totalRevenue += (8000 * qty);
      else totalRevenue += (4000 * qty);
    }

    const checkin = (item.statusCheckin || "").toUpperCase();
    if (checkin.includes("SUDAH")) {
      totalCheckedIn += qty;
    }
  });

  let sisaBundling = 95;
  if (quotaRes && quotaRes.quotaBundling && typeof quotaRes.quotaBundling.sisa !== "undefined") {
    sisaBundling = parseInt(quotaRes.quotaBundling.sisa, 10);
  }

  const elApproved = document.getElementById("statTotalApproved");
  const elRevenue = document.getElementById("statTotalRevenue");
  const elQuota = document.getElementById("statQuotaBundling");
  const elCheckin = document.getElementById("statTotalCheckedIn");

  if (elApproved) elApproved.textContent = totalApprovedTickets;
  if (elRevenue) elRevenue.textContent = formatRupiah(totalRevenue);
  if (elQuota) elQuota.textContent = `${sisaBundling} / 95`;
  if (elCheckin) elCheckin.textContent = totalCheckedIn;
}

// ============================================================
// 4. TAB SWITCHING (PENDING VS APPROVED)
// ============================================================
function switchTab(target) {
  currentTab = target;
  const btnPending = document.getElementById("tabBtnPending");
  const btnApproved = document.getElementById("tabBtnApproved");
  const desc = document.getElementById("tableSectionDesc");

  if (target === "pending") {
    if (btnPending) btnPending.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#FFDC17] text-[#2D2A1A] shadow-sm flex items-center gap-1.5 active:scale-95 active:brightness-90 transition-all duration-100 select-none cursor-pointer";
    if (btnApproved) btnApproved.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 active:scale-95 active:brightness-90 transition-all duration-100 select-none cursor-pointer";
    if (desc) desc.textContent = "Kelola pembayaran pending, lakukan verifikasi struk transfer QRIS, dan terbitkan e-ticket PDF ke email pemesan.";
  } else {
    if (btnApproved) btnApproved.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#FFDC17] text-[#2D2A1A] shadow-sm flex items-center gap-1.5 active:scale-95 active:brightness-90 transition-all duration-100 select-none cursor-pointer";
    if (btnPending) btnPending.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 active:scale-95 active:brightness-90 transition-all duration-100 select-none cursor-pointer";
    if (desc) desc.textContent = "Daftar tiket yang telah disetujui (APPROVED), file PDF e-ticket telah aktif dan dapat dibuka.";
  }

  renderCurrentTabTable();
}

// ============================================================
// 5. RENDER TABEL ANTREAN & ACC (DENGAN SANITASI XSS)
// ============================================================
function renderCurrentTabTable() {
  const tbody = document.getElementById("tableBody");
  const emptyBox = document.getElementById("tableEmpty");
  if (!tbody || !emptyBox) return;

  tbody.innerHTML = "";
  const items = currentTab === "pending" ? pendingOrdersList : approvedOrdersList;

  if (!items || items.length === 0) {
    emptyBox.classList.remove("hidden");
    const emptyTitle = document.getElementById("emptyTitle");
    const emptyDesc = document.getElementById("emptyDesc");
    if (emptyTitle) {
      emptyTitle.textContent = currentTab === "pending"
        ? "Semua Pembayaran Telah Terverifikasi!"
        : "Belum Ada Tiket Terbit";
    }
    if (emptyDesc) {
      emptyDesc.textContent = currentTab === "pending"
        ? "Saat ini tidak ada antrean pending. Klik tombol Segarkan untuk memeriksa pesanan baru."
        : "Tiket yang telah di-ACC akan muncul di tab ini.";
    }
    if (window.lucide) lucide.createIcons();
    return;
  }

  emptyBox.classList.add("hidden");

  items.forEach((item, idx) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-white/[0.03] transition-colors";

    const cleanWa = (item.whatsapp || "").toString().replace(/['\s-]/g, "");
    const safeNama = escapeHtml(item.nama || "-");
    const emailRaw = (item.email || "-").toString().trim();
    const safeEmail = escapeHtml(emailRaw);
    const safeKodeTiket = escapeHtml(item.kodeTiket || item.ticketCode || "");
    const safeVarian = escapeHtml(item.varian || "Tiket Reguler");
    const safeJumlah = escapeHtml(item.jumlah || 1);
    const safeWaktu = escapeHtml(item.waktu || item.timestamp || "-");
    const safeCleanWa = escapeHtml(cleanWa);
    const waLink = `https://wa.me/${cleanWa.replace(/^0/, "62")}?text=Halo%20${encodeURIComponent(item.nama || "")},%20konfirmasi%20tiket%20Bingkai%20Bisu%202026`;
    const safeWaLink = escapeHtml(waLink);
    const rawBukti = item.linkBukti || item.fileUrl || "";
    const rawPdf = item.linkPdf || item.pdfUrl || "https://drive.google.com";
    const safePdf = escapeHtml(rawPdf);
    const isApproved = currentTab === "approved" || (item.statusBayar || "").toUpperCase() === "APPROVED";

    tr.innerHTML = `
      <td class="py-3.5 px-4 text-center font-mono text-slate-400">${idx + 1}</td>
      <td class="py-3.5 px-4 whitespace-nowrap font-mono text-[11px] text-slate-300">
        ${safeWaktu}
      </td>
      <td class="py-3.5 px-4 font-semibold text-white">
        <span class="block font-bold">${safeNama}</span>
        ${safeKodeTiket ? `<span class="inline-block mt-0.5 text-[10px] font-mono text-[#FFDC17] bg-[#081B59] px-2 py-0.5 rounded border border-[#FFDC17]/30">${safeKodeTiket}</span>` : ''}
      </td>
      <td class="py-3.5 px-4 text-slate-300 font-mono text-[11px]">
        <div class="flex items-center gap-1">
          <i data-lucide="mail" class="w-3 h-3 text-[#FFDC17]"></i>
          <span class="truncate max-w-[160px]">${safeEmail}</span>
        </div>
      </td>
      <td class="py-3.5 px-4 whitespace-nowrap">
        <a
          href="${safeWaLink}"
          target="_blank"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FFDC17]/10 text-[#FFDC17] hover:bg-[#FFDC17]/20 font-mono text-[11px] active:scale-95 active:brightness-90 transition-all duration-100 select-none cursor-pointer"
        >
          <i data-lucide="phone" class="w-3 h-3"></i>
          <span>${safeCleanWa}</span>
        </a>
      </td>
      <td class="py-3.5 px-4">
        <span class="block font-medium text-white">${safeVarian}</span>
        <span class="text-[11px] text-[#FFDC17] font-semibold">${safeJumlah} Tiket</span>
      </td>
      <td class="py-3.5 px-4 font-display font-bold text-white whitespace-nowrap text-sm">
        ${formatRupiah(item.total || (item.jumlah * 4000))}
      </td>
      <td class="py-3.5 px-4 text-center whitespace-nowrap">
        ${rawBukti && rawBukti !== "-" ? `
          <button
            type="button"
            onclick="openReceiptModal(${idx})"
            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FFDC17]/15 text-[#FFDC17] hover:bg-[#FFDC17]/25 text-[11px] font-semibold active:scale-95 active:brightness-90 transition-all duration-100 select-none cursor-pointer"
          >
            <i data-lucide="search" class="w-3 h-3"></i>
            <span>Lihat Struk</span>
          </button>
        ` : `<span class="text-slate-500 font-mono text-[11px]">-</span>`}
      </td>
      <td class="py-3.5 px-4 text-center whitespace-nowrap">
        ${isApproved ? `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-[10px]">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>APPROVED</span>
          </span>
        ` : `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold text-[10px]">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span>PENDING</span>
          </span>
        `}
      </td>
      <td class="py-3.5 px-4 text-center whitespace-nowrap">
        ${isApproved ? `
          <a
            href="${safePdf}"
            target="_blank"
            class="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#FFDC17] text-[#2D2A1A] font-bold text-[11px] uppercase hover:bg-[#ECC90E] active:scale-95 active:brightness-90 transition-all duration-100 select-none cursor-pointer"
          >
            <i data-lucide="file-text" class="w-3 h-3 stroke-[2.5]"></i>
            <span>Buka PDF</span>
          </a>
          ${item.adminAcc && item.adminAcc !== '-' ? `
            <div class="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-400/10 border border-yellow-400/20 text-[10px] text-amber-300 font-mono">
              <i data-lucide="user-check" class="w-3 h-3 text-amber-300"></i>
              <span>ACC: ${escapeHtml(item.adminAcc)}</span>
            </div>
          ` : ''}
        ` : `
          <button
            type="button"
            onclick="executeAccTicket(pendingOrdersList[${idx}], this)"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#FFDC17] text-[#2D2A1A] font-black text-xs uppercase hover:bg-[#ECC90E] active:scale-95 active:brightness-90 transition-all duration-100 select-none cursor-pointer shadow-glow-yellow"
          >
            <i data-lucide="check-circle" class="w-3.5 h-3.5 stroke-[2.5]"></i>
            <span>ACC Tiket</span>
          </button>
        `}
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (window.lucide) lucide.createIcons();
}

// ============================================================
// 6. EKSEKUSI ACC TIKET & NOTIFIKASI EMAIL
// ============================================================
async function executeAccTicket(itemOrRowIndex, rawNamaOrBtn, rawEmail, btnElement) {
  let item = null;
  let btn = null;

  if (typeof itemOrRowIndex === "object" && itemOrRowIndex !== null) {
    item = itemOrRowIndex;
    btn = rawNamaOrBtn;
  } else if (typeof itemOrRowIndex === "number" && typeof rawNamaOrBtn !== "string") {
    const list = currentTab === "pending" ? pendingOrdersList : approvedOrdersList;
    item = list[itemOrRowIndex] || pendingOrdersList.find(o => o.rowIndex === itemOrRowIndex);
    btn = rawNamaOrBtn;
  } else {
    const rowIndex = itemOrRowIndex;
    const nama = typeof rawNamaOrBtn === "string" ? decodeURIComponent(rawNamaOrBtn) : "";
    const email = typeof rawEmail === "string" ? decodeURIComponent(rawEmail) : "";
    item = pendingOrdersList.find(o => o.rowIndex === rowIndex) || {
      rowIndex: rowIndex,
      nama: nama,
      email: email
    };
    btn = btnElement;
  }

  if (!item) return;

  if (!confirm(`Konfirmasi ACC dan terbitkan tiket resmi untuk pemesan: ${item.nama || "-"} (${item.email || "-"})?`)) {
    return;
  }

  const origHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="animate-spin h-3.5 w-3.5 text-[#240638]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      <span>Proses...</span>
    `;
  }

  try {
    const savedUser = (sessionStorage.getItem("adminUser") || "").trim();
    const savedPass = (sessionStorage.getItem("adminPass") || "").trim();
    const savedName = (sessionStorage.getItem("adminName") || "").trim();

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "admin_acc",
        rowIndex: item.rowIndex,
        username: savedUser,
        password: savedPass,
        adminName: savedName,
        pin: savedPass
      })
    });

    const result = await response.json();

    if (result && result.status === "UNAUTHORIZED") {
      sessionStorage.removeItem("adminUser");
      sessionStorage.removeItem("adminPass");
      sessionStorage.removeItem("adminName");
      sessionStorage.removeItem("adminPin");
      sessionStorage.clear();
      showAccToast("Akses ditolak: " + (result.message || "Sesi login berakhir."), "error");
      checkSessionAuth();
      return;
    }

    if (result && result.status === "ALREADY_APPROVED") {
      showAccToast(result.message || "Pesanan ini sudah lebih dulu di-ACC oleh admin lain.", "warning");
      closeReceiptModal();
      loadOrdersData();
      return;
    }

    if (result && result.status === "SUCCESS") {
      showAccToast(`Tiket ${result.kodeTiket || ""} (${item.nama || ""}) berhasil di-ACC! File PDF telah otomatis terkirim ke email: ${result.targetEmail || item.email || "-"}`, "success");
      closeReceiptModal();
      loadOrdersData();
    } else {
      const errMsg = (result && (result.message || result.error)) || "Gagal verifikasi tiket.";
      showAccToast(errMsg, "error");
    }

  } catch (err) {
    console.error("Gagal ACC tiket:", err);
    showAccToast("Gagal memproses ACC tiket: " + err.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
    if (window.lucide) lucide.createIcons();
  }
}

// ============================================================
// 7. TOAST NOTIFIKASI ACC (SUCCESS / ERROR / WARNING)
// ============================================================
let toastTimer = null;
function showAccToast(message, type = "success") {
  const toast = document.getElementById("accToastNotification");
  const msg = document.getElementById("accToastMessage");
  const title = document.getElementById("accToastTitle");
  const icon = document.getElementById("accToastIcon");

  if (msg) msg.textContent = message;

  if (toast) {
    if (type === "success") {
      if (title) title.textContent = "ACC Berhasil & Email Terkirim!";
      toast.className = "fixed top-6 right-6 z-50 max-w-md w-full bg-[#2A0859] border-2 border-[#FFDC17] rounded-2xl p-4 shadow-glow-yellow transform translate-y-0 opacity-100 transition-all duration-400 pointer-events-auto";
      if (icon) {
        icon.className = "w-10 h-10 rounded-xl bg-[#FFDC17] text-[#2D2A1A] flex items-center justify-center flex-shrink-0 shadow-md";
        icon.innerHTML = `<i data-lucide="check" class="w-6 h-6 stroke-[3]"></i>`;
      }
    } else if (type === "warning") {
      if (title) title.textContent = "Peringatan Anti-Bentrok";
      toast.className = "fixed top-6 right-6 z-50 max-w-md w-full bg-[#2A0859] border-2 border-amber-400 rounded-2xl p-4 shadow-glow-yellow transform translate-y-0 opacity-100 transition-all duration-400 pointer-events-auto";
      if (icon) {
        icon.className = "w-10 h-10 rounded-xl bg-amber-400 text-[#2D2A1A] flex items-center justify-center flex-shrink-0 shadow-md";
        icon.innerHTML = `<i data-lucide="alert-triangle" class="w-6 h-6 stroke-[2.5]"></i>`;
      }
    } else {
      if (title) title.textContent = "Terjadi Kesalahan";
      toast.className = "fixed top-6 right-6 z-50 max-w-md w-full bg-[#2A0859] border-2 border-red-500 rounded-2xl p-4 shadow-lg transform translate-y-0 opacity-100 transition-all duration-400 pointer-events-auto";
      if (icon) {
        icon.className = "w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center flex-shrink-0 shadow-md";
        icon.innerHTML = `<i data-lucide="alert-circle" class="w-6 h-6 stroke-[2.5]"></i>`;
      }
    }
  }

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hideAccToast(), 6000);
  if (window.lucide) lucide.createIcons();
}

function showAccNotification(nama, email) {
  showAccToast(`Tiket berhasil di-ACC! File PDF telah otomatis terkirim ke email: ${email}`, "success");
}

function hideAccToast() {
  const toast = document.getElementById("accToastNotification");
  if (toast) {
    toast.classList.remove("opacity-100", "translate-y-0", "pointer-events-auto");
    toast.classList.add("opacity-0", "translate-y-[-120%]", "pointer-events-none");
  }
}

// ============================================================
// 8. MODAL PRATINJAU BUKTI PEMBAYARAN (ENDPOINT TEROTENTIKASI PIN)
// ============================================================
async function openReceiptModal(idx) {
  const list = currentTab === "pending" ? pendingOrdersList : approvedOrdersList;
  const item = list[idx];
  if (!item) return;

  currentReceiptItem = item;
  const attendeeEl = document.getElementById("receiptModalAttendee");
  if (attendeeEl) attendeeEl.textContent = `Nama: ${item.nama || "-"} (${item.varian || "Tiket"})`;

  const img = document.getElementById("receiptModalImg");
  const fallback = document.getElementById("receiptImgFallback");
  const openBtn = document.getElementById("btnReceiptOpenNewTab");
  const accBtn = document.getElementById("btnModalAcc");
  const buktiUrl = item.linkBukti || item.fileUrl || "";

  if (accBtn) {
    if (currentTab === "approved" || (item.statusBayar || "").toUpperCase() === "APPROVED") {
      accBtn.classList.add("hidden");
    } else {
      accBtn.classList.remove("hidden");
      accBtn.onclick = () => {
        executeAccTicket(item, accBtn);
      };
    }
  }

  const modal = document.getElementById("receiptModal");
  if (modal) modal.classList.remove("hidden");

  // Tampilkan indikator loading saat memuat bukti Base64 secara terotentikasi
  if (img && fallback) {
    img.src = "";
    img.classList.add("hidden");
    fallback.classList.remove("hidden");
    fallback.innerHTML = `
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#FFDC17] border-t-transparent mb-2"></div>
      <p class="text-xs text-[#E2D9F3]">Mengambil bukti transfer secara aman dari server...</p>
    `;
  }
  if (window.lucide) lucide.createIcons();

  if (!buktiUrl || buktiUrl === "-") {
    if (fallback) {
      fallback.innerHTML = `
        <i data-lucide="image-off" class="w-8 h-8 mx-auto text-[#FFDC17]/60"></i>
        <p class="text-xs text-slate-300 mt-2">Tidak ada berkas bukti pembayaran terlampir.</p>
      `;
      if (window.lucide) lucide.createIcons();
    }
    return;
  }

  const savedUser = (sessionStorage.getItem("adminUser") || "").trim();
  const savedPass = (sessionStorage.getItem("adminPass") || "").trim();
  const savedName = (sessionStorage.getItem("adminName") || "").trim();

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "admin_get_proof",
        username: savedUser,
        password: savedPass,
        adminName: savedName,
        pin: savedPass,
        fileId: buktiUrl,
        rowIndex: item.rowIndex
      })
    });

    const res = await response.json();

    if (res && res.status === "SUCCESS" && res.dataUrl) {
      if (img && fallback) {
        img.src = res.dataUrl;
        img.classList.remove("hidden");
        fallback.classList.add("hidden");
      }
      if (openBtn) {
        openBtn.href = res.dataUrl;
      }
    } else {
      if (fallback) {
        fallback.innerHTML = `
          <i data-lucide="image-off" class="w-8 h-8 mx-auto text-[#FFDC17]/60"></i>
          <p class="text-xs text-slate-300 mt-2">${escapeHtml(res.message || "Gagal memuat bukti pembayaran.")}</p>
        `;
        if (window.lucide) lucide.createIcons();
      }
    }
  } catch (err) {
    if (fallback) {
      fallback.innerHTML = `
        <i data-lucide="alert-circle" class="w-8 h-8 mx-auto text-red-400"></i>
        <p class="text-xs text-red-300 mt-2">Kendala jaringan saat memuat gambar: ${escapeHtml(err.message || err)}</p>
      `;
      if (window.lucide) lucide.createIcons();
    }
  }
}

function closeReceiptModal() {
  const modal = document.getElementById("receiptModal");
  if (modal) modal.classList.add("hidden");
}

// ============================================================
// 9. MODAL SCANNER KAMERA GATE & OVERLAY RINCIAN LENGKAP
// ============================================================
let isAdminScanLocked = false;

function getMerchFromVariant(variantName) {
  const v = (variantName || "").toLowerCase();
  if (v.includes("ganci") || (v.includes("bundling") && v.includes("stiker"))) {
    return {
      ada: true,
      namaSouvenir: "Official Stiker + Ganci Akrilik",
      text: "Free Stiker Vinyl + Gantungan Kunci Akrilik",
      textScanner: "1x Official Stiker + 1x Ganci Akrilik",
      badge: "STIKER & GANCI"
    };
  } else if (v.includes("stiker")) {
    return {
      ada: true,
      namaSouvenir: "Official Vinyl Stiker",
      text: "Free Official Stiker Vinyl",
      textScanner: "1x Official Vinyl Stiker",
      badge: "FREE STIKER"
    };
  }
  return {
    ada: false,
    namaSouvenir: "",
    text: "Tanpa Merchandise Fisik",
    textScanner: "Tanpa Merchandise",
    badge: "REGULER"
  };
}

function formatKodeTiket(code) {
  if (!code) return "#BB26-XXXX";
  const c = code.toString().trim().toUpperCase();
  if (c.startsWith("#")) return c;
  if (c.startsWith("BB26-")) return "#" + c;
  return "#BB26-" + c.replace(/^BB26-?/, "");
}

function openAdminScannerModal() {
  const modal = document.getElementById("adminScannerModal");
  const overlay = document.getElementById("adminScanDetailOverlay");
  if (overlay) overlay.classList.add("hidden");
  isAdminScanLocked = false;

  if (modal) modal.classList.remove("hidden");
  startAdminQrScanner();
  if (window.lucide) lucide.createIcons();
}

function closeAdminScannerModal() {
  const modal = document.getElementById("adminScannerModal");
  const overlay = document.getElementById("adminScanDetailOverlay");
  if (overlay) overlay.classList.add("hidden");
  if (modal) modal.classList.add("hidden");
  isAdminScanLocked = false;

  if (html5QrScanner) {
    html5QrScanner.stop().catch(() => {}).finally(() => {
      html5QrScanner = null;
    });
  }
}

function resumeAdminScanner() {
  const overlay = document.getElementById("adminScanDetailOverlay");
  if (overlay) overlay.classList.add("hidden");

  const box = document.getElementById("adminScanResultBox");
  if (box) {
    box.innerHTML = `Arahkan kamera ke QR Code E-Ticket pengunjung`;
  }

  if (html5QrScanner) {
    try {
      html5QrScanner.resume();
    } catch (e) {
      console.warn("Gagal resume scanner:", e);
    }
  }
  isAdminScanLocked = false;
}

function startAdminQrScanner() {
  if (html5QrScanner) return;
  html5QrScanner = new Html5Qrcode("adminReader");
  html5QrScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      // KUNCI DAN JEDA KAMERA SEKETIKA AGAR TIDAK SCAN GANDA DALAM MILIDETIK
      if (isAdminScanLocked) return;
      isAdminScanLocked = true;

      if (html5QrScanner) {
        try {
          html5QrScanner.pause(true, false);
        } catch (e) {
          console.warn("Gagal pause scanner:", e);
        }
      }

      const box = document.getElementById("adminScanResultBox");
      if (box) {
        box.innerHTML = `
          <span class="text-[#FFDC17] font-bold font-mono text-sm block">QR Terdeteksi: ${escapeHtml(decodedText)}</span>
          <span class="text-[11px] text-emerald-400">Memeriksa database...</span>
        `;
      }
      validateScannedTicket(decodedText);
    },
    (error) => {}
  ).catch(err => {
    const box = document.getElementById("adminScanResultBox");
    if (box) box.textContent = "Tidak dapat mengakses kamera: " + err;
  });
}

async function validateScannedTicket(code) {
  const cleanCode = (code || "").replace(/[^A-Z0-9]/g, "").toUpperCase();
  const local = approvedOrdersList.find(t => {
    const tc = (t.kodeTiket || t.ticketCode || "").replace(/[^A-Z0-9]/g, "").toUpperCase();
    return tc === cleanCode || (cleanCode && tc.replace(/^BB26/, "") === cleanCode.replace(/^BB26/, ""));
  });

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "scan_ticket", kodeTiket: code })
    });
    const res = await response.json();

    const overlay = document.getElementById("adminScanDetailOverlay");
    const iconEl = document.getElementById("adminScanIcon");
    const titleEl = document.getElementById("adminScanTitle");
    const subtitleEl = document.getElementById("adminScanSubtitle");
    const kodeEl = document.getElementById("adminScanKode");
    const namaEl = document.getElementById("adminScanNama");
    const contactEl = document.getElementById("adminScanContact");
    const qtyEl = document.getElementById("adminScanQty");
    const varianEl = document.getElementById("adminScanVarian");
    const souvenirContent = document.getElementById("adminScanSouvenirContent");
    const souvenirIcon = document.getElementById("adminScanSouvenirIcon");
    const souvenirText = document.getElementById("adminScanSouvenirText");

    const attendeeName = local ? local.nama : (res ? (res.nama || "-") : "-");
    const contactInfo = local ? (local.wa || local.email || "-") : (res ? (res.contact || res.whatsapp || res.email || "-") : "-");
    const qtyVal = (res && res.jumlah) ? res.jumlah : (local ? (local.jumlah || 1) : 1);
    const ticketVarian = local ? (local.varian || local.paket || "-") : (res ? (res.varian || res.pass || "Tiket Festival") : "Tiket Festival");
    const displayKode = formatKodeTiket(local ? local.kodeTiket : (res ? (res.kodeTiket || code) : code));

    if (kodeEl) kodeEl.textContent = displayKode;
    if (namaEl) namaEl.textContent = attendeeName;
    if (contactEl) contactEl.textContent = contactInfo;
    if (qtyEl) qtyEl.textContent = `${qtyVal} Orang`;
    const qtyBadgeNumEl = document.getElementById("adminScanQtyNum");
    if (qtyBadgeNumEl) qtyBadgeNumEl.textContent = qtyVal;
    if (varianEl) varianEl.textContent = ticketVarian;

    // Evaluasi Hak Souvenir: [Qty]x [Nama Souvenir] atau "Tanpa Souvenir"
    const merch = (res && res.merch && res.merch.ada) ? res.merch : getMerchFromVariant(ticketVarian);
    if (merch && merch.ada) {
      const souvenirItemName = merch.namaSouvenir || (merch.textScanner ? merch.textScanner.replace(/^\d+x\s*/i, "") : (merch.text || "Official Merchandise"));
      if (souvenirContent) {
        souvenirContent.className = "p-3 rounded-xl bg-yellow-400 text-[#240638] font-black text-xs text-center tracking-wide shadow-md flex items-center justify-center gap-1.5";
      }
      if (souvenirIcon) souvenirIcon.textContent = "🎁";
      if (souvenirText) souvenirText.textContent = `BERIKAN SOUVENIR: ${qtyVal}x ${souvenirItemName}`;
    } else {
      if (souvenirContent) {
        souvenirContent.className = "p-2.5 rounded-xl bg-slate-800/80 text-slate-300 font-bold text-xs text-center tracking-wide flex items-center justify-center gap-1.5";
      }
      if (souvenirIcon) souvenirIcon.textContent = "ℹ️";
      if (souvenirText) souvenirText.textContent = "Tanpa Souvenir";
    }

    if (overlay) {
      overlay.classList.remove("border-emerald-500", "border-amber-500", "border-red-500");

      if (res && res.status === "SUCCESS") {
        if (iconEl) iconEl.textContent = "✅";
        if (titleEl) {
          titleEl.textContent = res.message || "✅ TIKET VALID - SILAKAN MASUK";
        }
        if (subtitleEl) {
          subtitleEl.textContent = res.day === 1 
            ? "Hari ke-1 tercatat. Tiket dapat digunakan kembali besok." 
            : (res.day === 2 ? "Hari ke-2 selesai digunakan." : "Check-in gate berhasil dikonfirmasi.");
        }
        overlay.classList.add("border-emerald-500");

        if (local) {
          local.statusCheckin = res.day === 1 ? "MASUK HARI 1" : (res.day === 2 ? "SELESAI HARI 2" : "SUDAH MASUK");
          local.waktuScan = res.waktu || new Date().toLocaleString();
        }
      } else if (res && (res.status === "ALREADY_CHECKED_IN" || res.status === "ALREADY_USED" || res.status === "ALREADY_USED_TODAY")) {
        if (iconEl) iconEl.textContent = "⚠️";
        if (titleEl) {
          titleEl.textContent = res.message || (res.status === "ALREADY_USED_TODAY" ? "⚠️ TIKET SUDAH DIPAKAI HARI INI" : "⚠️ TIKET SUDAH DIGUNAKAN");
        }
        if (subtitleEl) {
          subtitleEl.textContent = res.status === "ALREADY_USED_TODAY" 
            ? "Bisa digunakan kembali besok untuk Hari ke-2!" 
            : "Tiket ini telah dipakai sebelumnya.";
        }
        overlay.classList.add("border-amber-500");
      } else {
        if (iconEl) iconEl.textContent = "❌";
        if (titleEl) titleEl.textContent = "❌ TIKET TIDAK VALID / TIDAK DITEMUKAN";
        if (subtitleEl) subtitleEl.textContent = (res && res.message) ? res.message : "Data tiket tidak ditemukan di sistem.";
        overlay.classList.add("border-red-500");
      }

      overlay.classList.remove("hidden");
    }

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Scan error:", err);
    const overlay = document.getElementById("adminScanDetailOverlay");
    const iconEl = document.getElementById("adminScanIcon");
    const titleEl = document.getElementById("adminScanTitle");
    const subtitleEl = document.getElementById("adminScanSubtitle");

    if (overlay) {
      overlay.classList.remove("border-emerald-500", "border-amber-500");
      overlay.classList.add("border-red-500");
      if (iconEl) iconEl.textContent = "❌";
      if (titleEl) titleEl.textContent = "❌ GAGAL MEMERIKSA TIKET";
      if (subtitleEl) subtitleEl.textContent = "Koneksi ke server bermasalah: " + (err.message || err);
      overlay.classList.remove("hidden");
    }
  }
}

// Shortcut Keyboard untuk menutup overlay scanner
window.addEventListener("keydown", (e) => {
  const overlay = document.getElementById("adminScanDetailOverlay");
  if (overlay && !overlay.classList.contains("hidden")) {
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
      e.preventDefault();
      resumeAdminScanner();
    }
  }
});

// ============================================================
// INISIALISASI
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  checkSessionAuth();
  if (window.lucide) lucide.createIcons();
});

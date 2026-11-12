/**
 * app.js — Logika Frontend Portal Tiket Publik
 * Bingkai Bisu • Fixlens Festival 2026
 * Mencakup: seleksi varian tiket resmi, submit pemesanan QRIS,
 *            cek status pesanan, stealth admin PIN mode.
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
// DATA 4 KATEGORI TIKET RESMI (TERKUNCI)
// ============================================================
const VARIANTS = Object.freeze({
  tiket_1hari: {
    key: "tiket_1hari",
    name: "Tiket 1 Hari",
    price: 4000,
    badgeText: "Tiket 1 Hari - Rp 4.000",
    img: "assets/Tiket_1hari.webp",
    isPresale: false
  },
  tiket_2hari_biasa: {
    key: "tiket_2hari_biasa",
    name: "Tiket 2 Hari Biasa",
    price: 6000,
    badgeText: "Tiket 2 Hari Biasa - Rp 6.000",
    img: "assets/tiket_2hari_biasa.webp",
    isPresale: false
  },
  tiket_2hari_stiker: {
    key: "tiket_2hari_stiker",
    name: "Tiket 2 Hari + Free Stiker",
    price: 8000,
    badgeText: "Tiket 2 Hari + Free Stiker - Rp 8.000",
    img: "assets/tiket_2hari_stiker.webp",
    isPresale: false
  },
  tiket_presale: {
    key: "tiket_presale",
    name: "Presale: Tiket + Stiker + Ganci",
    price: 10000,
    badgeText: "Presale: Tiket + Stiker + Ganci - Rp 10.000",
    img: "assets/tiket_2hari_stikerganci.webp",
    isPresale: true
  }
});

// ============================================================
// STATE APLIKASI
// ============================================================
let currentSelectedVariant = "tiket_1hari";
let currentQuantity = 1;
let currentPresaleQuotaRemaining = 100;
let selectedProofBase64 = null;
let selectedProofFileName = "bukti_qris.jpg";

// ============================================================
// NOTIFIKASI TOAST MELAYANG
// ============================================================
let toastTimeout = null;
function showFloatingToast(message) {
  const toast = document.getElementById("toastNotification");
  const msg = document.getElementById("toastMessage");
  if (!toast || !msg) return;

  msg.textContent = message;
  toast.classList.remove("opacity-0", "translate-y-6", "pointer-events-none");
  toast.classList.add("opacity-100", "translate-y-0", "pointer-events-auto");

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0", "pointer-events-auto");
    toast.classList.add("opacity-0", "translate-y-6", "pointer-events-none");
  }, 3000);
}

// ============================================================
// 1. SISTEM 4 TAB NAVIGASI
// ============================================================
function switchMainTab(targetTab) {
  const tab01 = document.getElementById("tabContentTiket");
  const tab02 = document.getElementById("tabContentDeskripsi");
  const tab03 = document.getElementById("tabContentSnk");
  const tab04 = document.getElementById("tabContentCek");

  const btn01 = document.getElementById("tabBtn01");
  const btn02 = document.getElementById("tabBtn02");
  const btn03 = document.getElementById("tabBtn03");
  const btn04 = document.getElementById("tabBtn04");

  // Sembunyikan semua tab
  if (tab01) tab01.classList.add("hidden");
  if (tab02) tab02.classList.add("hidden");
  if (tab03) tab03.classList.add("hidden");
  if (tab04) tab04.classList.add("hidden");

  // Reset tombol
  [btn01, btn02, btn03, btn04].forEach(btn => {
    if (!btn) return;
    btn.classList.remove("border-[#FFDC17]", "text-[#FFDC17]", "font-bold");
    btn.classList.add("border-transparent", "text-slate-400", "font-semibold");
  });

  if (targetTab === "tiket") {
    if (tab01) tab01.classList.remove("hidden");
    if (btn01) {
      btn01.classList.add("border-[#FFDC17]", "text-[#FFDC17]", "font-bold");
      btn01.classList.remove("border-transparent", "text-slate-400");
    }
  } else if (targetTab === "deskripsi") {
    if (tab02) tab02.classList.remove("hidden");
    if (btn02) {
      btn02.classList.add("border-[#FFDC17]", "text-[#FFDC17]", "font-bold");
      btn02.classList.remove("border-transparent", "text-slate-400");
    }
  } else if (targetTab === "snk") {
    if (tab03) tab03.classList.remove("hidden");
    if (btn03) {
      btn03.classList.add("border-[#FFDC17]", "text-[#FFDC17]", "font-bold");
      btn03.classList.remove("border-transparent", "text-slate-400");
    }
  } else if (targetTab === "cek") {
    if (tab04) tab04.classList.remove("hidden");
    if (btn04) {
      btn04.classList.add("border-[#FFDC17]", "text-[#FFDC17]", "font-bold");
      btn04.classList.remove("border-transparent", "text-slate-400");
    }
  }

  if (window.lucide) lucide.createIcons();
}

function scrollToTicketsSection() {
  switchMainTab('tiket');
  const ticketSection = document.getElementById("tabContentTiket");
  if (ticketSection) {
    ticketSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ============================================================
// 2. REFRESH STOK TIKET (action: get_quota)
// ============================================================
async function refreshTicketStock(isManualClick = false) {
  const refreshIcon = document.getElementById("refreshIcon");
  if (refreshIcon) refreshIcon.classList.add("animate-spin");

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "get_quota" })
    });
    const res = await response.json();

    if (res && res.quotaBundling) {
      currentPresaleQuotaRemaining = parseInt(res.quotaBundling.sisa, 10);
      if (isNaN(currentPresaleQuotaRemaining)) currentPresaleQuotaRemaining = 100;

      const badge = document.getElementById("badgeQuotaPresale");
      const cardPresale = document.getElementById("cardVariant4");
      const btnSelect4 = document.getElementById("btnSelect4");

      if (currentPresaleQuotaRemaining <= 0) {
        if (badge) {
          badge.textContent = "[ SOLD OUT ]";
          badge.className = "px-2.5 py-0.5 rounded-full bg-red-600/30 text-[10px] font-mono font-bold text-red-400 border border-red-500/50";
        }
        if (cardPresale) cardPresale.classList.add("opacity-60");
        if (btnSelect4) {
          btnSelect4.disabled = true;
          btnSelect4.classList.add("opacity-50", "cursor-not-allowed");
        }
      } else {
        if (badge) {
          badge.textContent = `[ Sisa ${currentPresaleQuotaRemaining} / 100 Pcs ]`;
          badge.className = "px-2.5 py-0.5 rounded-full bg-[#FFDC17]/20 text-[10px] font-mono font-bold text-[#FFDC17] border border-[#FFDC17]/40";
        }
        if (cardPresale) cardPresale.classList.remove("opacity-60");
        if (btnSelect4) {
          btnSelect4.disabled = false;
          btnSelect4.classList.remove("opacity-50", "cursor-not-allowed");
        }
      }

      if (isManualClick) {
        showFloatingToast("Ketersediaan tiket berhasil diperbarui!");
      }
    }
  } catch (err) {
    console.warn("Gagal refresh kuota:", err);
  } finally {
    if (refreshIcon) refreshIcon.classList.remove("animate-spin");
    validateQuotaAndCalculateTotal();
  }
}

// ============================================================
// 3. SELEKSI VARIAN TIKET & INTEGRITAS DATA CHECKOUT
// ============================================================
function selectTicketVariant(variantKey) {
  // Integritas: Validasi bahwa variantKey ada di dalam objek VARIANTS resmi
  if (!VARIANTS[variantKey]) {
    console.warn("Varian tiket tidak sah:", variantKey);
    return;
  }

  if (variantKey === "tiket_presale" && currentPresaleQuotaRemaining <= 0) {
    showFloatingToast("Paket Presale telah habis (SOLD OUT)!");
    return;
  }

  currentSelectedVariant = variantKey;

  const cards = {
    tiket_1hari: document.getElementById("cardVariant1"),
    tiket_2hari_biasa: document.getElementById("cardVariant2"),
    tiket_2hari_stiker: document.getElementById("cardVariant3"),
    tiket_presale: document.getElementById("cardVariant4")
  };

  Object.keys(cards).forEach(key => {
    const c = cards[key];
    if (!c) return;
    if (key === variantKey) {
      c.classList.add("border-[#FFDC17]", "ring-2", "ring-[#FFDC17]/50", "shadow-glow-gold");
      c.classList.remove("border-[#FFDC17]/30", "border-[#FFDC17]/40");
    } else {
      c.classList.remove("border-[#FFDC17]", "ring-2", "ring-[#FFDC17]/50", "shadow-glow-gold");
      c.classList.add("border-[#FFDC17]/30");
    }
  });

  const b1 = document.getElementById("btnSelectText1");
  const b2 = document.getElementById("btnSelectText2");
  const b3 = document.getElementById("btnSelectText3");
  const b4 = document.getElementById("btnSelectText4");

  if (b1) b1.textContent = variantKey === "tiket_1hari" ? "✓ Terpilih" : "Pilih Tiket ⌵";
  if (b2) b2.textContent = variantKey === "tiket_2hari_biasa" ? "✓ Terpilih" : "Pilih Tiket ⌵";
  if (b3) b3.textContent = variantKey === "tiket_2hari_stiker" ? "✓ Terpilih" : "Pilih Tiket ⌵";
  if (b4) b4.textContent = variantKey === "tiket_presale" ? "✓ Terpilih" : "Pilih Tiket ⌵";

  const badgeEl = document.getElementById("checkoutSelectedBadge");
  if (badgeEl) badgeEl.textContent = VARIANTS[variantKey].badgeText;

  validateQuotaAndCalculateTotal();

  const formContainer = document.getElementById("checkoutFormContainer");
  if (formContainer) {
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function adjustQuantity(delta) {
  const qtyInput = document.getElementById("ticketQty");
  if (!qtyInput) return;
  let val = parseInt(qtyInput.value, 10) || 1;
  val = Math.max(1, Math.min(10, val + delta));
  qtyInput.value = val;
  handleQuantityChange();
}

function handleQuantityChange() {
  const qtyInput = document.getElementById("ticketQty");
  if (!qtyInput) return;
  let val = parseInt(qtyInput.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 10) val = 10;
  currentQuantity = val;
  qtyInput.value = val;
  validateQuotaAndCalculateTotal();
}

function validateQuotaAndCalculateTotal() {
  const qtyInput = document.getElementById("ticketQty");
  let qty = parseInt(qtyInput ? qtyInput.value : 1, 10) || 1;
  if (qty < 1) qty = 1;
  if (qty > 10) qty = 10;

  // Integritas: Kunci data varian dari VARIANTS resmi
  const safeVariantKey = VARIANTS[currentSelectedVariant] ? currentSelectedVariant : "tiket_1hari";
  const variant = VARIANTS[safeVariantKey];

  // Kalkulasi total terkunci dari variant.price resmi
  const totalPrice = variant.price * qty;
  const formattedTotal = "Rp " + totalPrice.toLocaleString("id-ID");

  const calcDisplay = document.getElementById("calculatedTotalDisplay");
  const qrisTotalEl = document.getElementById("qrisTotalAmount");
  if (calcDisplay) calcDisplay.textContent = formattedTotal;
  if (qrisTotalEl) qrisTotalEl.textContent = formattedTotal;

  const warningBox = document.getElementById("quotaWarningBox");
  const warningText = document.getElementById("quotaWarningText");
  const submitBtn = document.getElementById("btnSubmitOrder");

  // Logika Kuota Ketat Presale
  if (variant.isPresale) {
    if (currentPresaleQuotaRemaining <= 0) {
      if (warningBox) warningBox.classList.remove("hidden");
      if (warningText) warningText.textContent = "⚠️ Maaf, kuota Presale (100 tiket) telah habis terjual (SOLD OUT).";
      if (submitBtn) submitBtn.disabled = true;
      return;
    } else if (qty > currentPresaleQuotaRemaining) {
      if (warningBox) warningBox.classList.remove("hidden");
      if (warningText) warningText.textContent = `⚠️ Pesanan melebihi sisa kuota! Maksimal pemesanan paket ini adalah ${currentPresaleQuotaRemaining} tiket.`;
      if (submitBtn) submitBtn.disabled = true;
      return;
    }
  }

  if (warningBox) warningBox.classList.add("hidden");
  if (submitBtn) submitBtn.disabled = false;
}

// ============================================================
// 4. UPLOAD BUKTI TRANSFER QRIS (BASE64)
// ============================================================
function handleProofFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  selectedProofFileName = file.name || "bukti_qris.jpg";
  const nameEl = document.getElementById("proofFileName");
  const sizeEl = document.getElementById("proofFileSize");
  if (nameEl) nameEl.textContent = selectedProofFileName;
  if (sizeEl) sizeEl.textContent = (file.size / 1024).toFixed(1) + " KB";

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const MAX_WIDTH = 1200;
      const MAX_HEIGHT = 1200;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.75);
      selectedProofBase64 = compressedDataUrl.replace(/^data:image\/\w+;base64,/, "");

      const previewImg = document.getElementById("proofPreviewImg");
      if (previewImg) previewImg.src = compressedDataUrl;
      const dropContent = document.getElementById("dropZoneContent");
      const previewBox = document.getElementById("proofPreviewBox");
      if (dropContent) dropContent.classList.add("hidden");
      if (previewBox) previewBox.classList.remove("hidden");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ============================================================
// 5. SUBMIT PEMESANAN (MURNI PENDING DENGAN INTEGRITAS HARGA)
// ============================================================
async function handleOrderSubmit(e) {
  e.preventDefault();

  const nama = document.getElementById("inputName").value.trim();
  const email = document.getElementById("inputEmail").value.trim();
  const whatsapp = document.getElementById("inputWa").value.trim();
  const rawQty = parseInt(document.getElementById("ticketQty").value, 10) || 1;
  const qty = Math.max(1, Math.min(10, rawQty));

  // Integritas: Kunci varian dan harga dari objek VARIANTS resmi
  const safeVariantKey = VARIANTS[currentSelectedVariant] ? currentSelectedVariant : "tiket_1hari";
  const variant = VARIANTS[safeVariantKey];
  const total = variant.price * qty;

  if (!nama || !email || !whatsapp) {
    alert("Mohon lengkapi seluruh kolom formulir!");
    return;
  }

  if (!selectedProofBase64) {
    alert("Harap unggah tangkapan layar bukti pembayaran QRIS Anda terlebih dahulu!");
    const dropZone = document.getElementById("dropZoneProof");
    if (dropZone) dropZone.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  if (variant.isPresale && qty > currentPresaleQuotaRemaining) {
    alert(`Pesanan melebihi sisa kuota! Maksimal pemesanan paket ini adalah ${currentPresaleQuotaRemaining} tiket.`);
    return;
  }

  const btn = document.getElementById("btnSubmitOrder");
  const text = document.getElementById("btnSubmitText");
  const spinner = document.getElementById("btnSubmitSpinner");

  if (btn) btn.disabled = true;
  if (text) text.classList.add("hidden");
  if (spinner) spinner.classList.remove("hidden");

  const payload = {
    action: "submit_order",
    nama: nama,
    email: email,
    whatsapp: whatsapp,
    varian: variant.name,
    jumlah: qty,
    total: total,
    fileData: selectedProofBase64,
    namaFile: selectedProofFileName
  };

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const res = await response.json();

    if (res && (res.status === "SUCCESS" || res.status === "success" || res.ticketCode)) {
      // Tampilkan modal status PENDING dengan data yang aman
      const elName = document.getElementById("pendingNameText");
      const elEmail = document.getElementById("pendingEmailText");
      const elCode = document.getElementById("pendingTicketCode");
      const modal = document.getElementById("orderPendingModal");

      if (elName) elName.textContent = nama;
      if (elEmail) elEmail.textContent = email;
      if (elCode) elCode.textContent = res.ticketCode || "#BB26-PENDING";
      if (modal) modal.classList.remove("hidden");

      // Reset formulir
      const form = document.getElementById("orderForm");
      if (form) form.reset();
      selectedProofBase64 = null;
      const dropContent = document.getElementById("dropZoneContent");
      const previewBox = document.getElementById("proofPreviewBox");
      if (dropContent) dropContent.classList.remove("hidden");
      if (previewBox) previewBox.classList.add("hidden");

      selectTicketVariant("tiket_1hari");
      refreshTicketStock();
    } else {
      alert("Pemesanan gagal diproses: " + (res.message || "Terjadi kendala pada server."));
    }

  } catch (err) {
    console.error("Gagal submit order:", err);
    alert("Gagal mengirimkan pemesanan. Pastikan koneksi internet stabil lalu coba kembali.");
  } finally {
    if (btn) btn.disabled = false;
    if (text) text.classList.remove("hidden");
    if (spinner) spinner.classList.add("hidden");
    if (window.lucide) lucide.createIcons();
  }
}

function closeOrderPendingModal() {
  const modal = document.getElementById("orderPendingModal");
  if (modal) modal.classList.add("hidden");
}

// ============================================================
// 6. TAB 04: CEK STATUS PESANAN (DENGAN SANITASI XSS DOM-BASED)
// ============================================================
async function handleCheckStatusSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const inputEl = document.getElementById("checkStatusQueryInput");
  const inputNilai = inputEl ? inputEl.value : "";
  const query = inputNilai.trim();
  const btn = document.getElementById("btnCheckQuerySubmit");
  const btnText = document.getElementById("btnCheckQueryText");

  if (!query) return;

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = "Memeriksa...";

  const resContainer = document.getElementById("checkStatusResultContainer");
  const cardsList = document.getElementById("checkStatusCardsList");
  const boxNotFound = document.getElementById("checkResultNotFoundBox");

  if (resContainer) resContainer.classList.remove("hidden");
  if (cardsList) {
    cardsList.innerHTML = "";
    cardsList.classList.remove("hidden");
  }
  if (boxNotFound) boxNotFound.classList.add("hidden");

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "check_status",
        query: query
      })
    });

    const res = await response.json();

    if (res && res.status === "SUCCESS" && res.data && res.data.length > 0) {
      if (boxNotFound) boxNotFound.classList.add("hidden");
      cardsList.innerHTML = "";

      res.data.forEach((item) => {
        const isApproved = (item.status || "").toUpperCase() === "APPROVED";
        // Sanitasi seluruh data database/input sebelum dimasukkan ke innerHTML
        const namaPemesan = escapeHtml(item.nama || "-");
        const kategoriTiket = escapeHtml(item.varian || item.kategori || "Tiket Festival");
        const jumlahTiket = escapeHtml(item.jumlah || 1);
        const kodeTiket = escapeHtml(item.kodeTiket || item.ticketCode || "-");

        const card = document.createElement("div");
        card.className = isApproved
          ? "p-5 rounded-2xl bg-[#240847] border border-emerald-500/50 space-y-3 text-left shadow-lg"
          : "p-5 rounded-2xl bg-[#240847] border border-amber-500/50 space-y-3 text-left shadow-md";

        card.innerHTML = `
          <div class="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-3">
            <div>
              <span class="text-[10px] font-mono tracking-wider text-slate-400 block uppercase">Kode Tiket</span>
              <span class="font-mono text-sm font-bold text-[#FFDC17]">${kodeTiket}</span>
            </div>
            <div>
              ${isApproved ? `
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs border border-emerald-500/30">
                  <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>TERVERIFIKASI</span>
                </span>
              ` : `
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold text-xs border border-amber-500/30">
                  <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  <span>MENUNGGU VERIFIKASI PANITIA</span>
                </span>
              `}
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#E2D9F3] pt-1">
            <div>
              <span class="text-[11px] text-slate-400 block">Nama Pemesan:</span>
              <strong class="text-white text-sm block">${namaPemesan}</strong>
            </div>
            <div>
              <span class="text-[11px] text-slate-400 block">Kategori Tiket:</span>
              <strong class="text-white text-sm block">${kategoriTiket}</strong>
            </div>
            <div>
              <span class="text-[11px] text-slate-400 block">Jumlah Tiket:</span>
              <strong class="text-[#FFDC17] font-mono text-sm block">${jumlahTiket} Tiket</strong>
            </div>
            <div>
              <span class="text-[11px] text-slate-400 block">Kode Tiket:</span>
              <strong class="text-[#FFDC17] font-mono text-sm block">${kodeTiket}</strong>
            </div>
          </div>

          ${isApproved ? `
            <div class="pt-2">
              <div class="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm font-sans flex items-start gap-2.5 shadow-sm">
                <span class="text-base leading-none">📩</span>
                <p class="leading-relaxed">E-Ticket PDF resmi telah dikirim otomatis ke email kamu. Silakan cek kotak masuk (Inbox) atau folder Spam.</p>
              </div>
            </div>
          ` : ''}
        `;

        cardsList.appendChild(card);
      });
    } else {
      if (cardsList) cardsList.innerHTML = "";
      if (boxNotFound) boxNotFound.classList.remove("hidden");
    }
  } catch (err) {
    console.error("Gagal cek status:", err);
    if (cardsList) cardsList.innerHTML = "";
    if (boxNotFound) boxNotFound.classList.remove("hidden");
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "Cek Status Pesanan";
    if (window.lucide) lucide.createIcons();
  }
}

function handleCheckStatus(query) {
  if (typeof query === "string") {
    const inputEl = document.getElementById("checkStatusQueryInput");
    if (inputEl) inputEl.value = query;
  }
  return handleCheckStatusSubmit();
}

// ============================================================
// 7. AKSES ADMIN STEALTH (TANPA HARDCODED PIN)
// ============================================================
let stealthTapCount = 0;
let stealthFirstTapTime = 0;
let stealthLastTapTime = 0;

function handleStealthTapEvent() {
  const now = Date.now();

  if (now - stealthLastTapTime > 1000) {
    stealthTapCount = 1;
    stealthFirstTapTime = now;
  } else {
    stealthTapCount++;
  }
  stealthLastTapTime = now;

  if (stealthTapCount >= 5) {
    if (now - stealthFirstTapTime <= 2000) {
      openAdminPinModal();
      stealthTapCount = 0;
    } else {
      stealthTapCount = 1;
      stealthFirstTapTime = now;
    }
  }
}

function openAdminPinModal() {
  const modal = document.getElementById("adminPinModal");
  const input = document.getElementById("adminSecretPinInput");
  if (modal && input) {
    modal.classList.remove("hidden");
    input.value = "";
    setTimeout(() => input.focus(), 150);
  }
}

function closeAdminPinModal() {
  const modal = document.getElementById("adminPinModal");
  if (modal) modal.classList.add("hidden");
}

function handleAdminPinSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("adminSecretPinInput");
  const pinVal = (input.value || "").trim();

  // KEAMANAN: Hapus hardcoded PIN dari frontend.
  // Simpan input PIN pengguna ke sessionStorage lalu verifikasi via action "admin_get_pending" di admin.html
  if (pinVal) {
    sessionStorage.setItem('adminPin', pinVal);
    window.location.href = "admin.html";
  } else {
    alert("Silakan masukkan PIN keamanan!");
  }
}

// ============================================================
// 8. HELPER SHARING & INISIALISASI
// ============================================================
function copyPageUrl(btn) {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = `<span class="text-[#FFDC17] font-bold text-[10px]">Tersalin!</span>`;
    setTimeout(() => { btn.innerHTML = orig; if (window.lucide) lucide.createIcons(); }, 1800);
  }).catch(() => {
    alert("Link halaman: " + window.location.href);
  });
}

function shareToWhatsApp() {
  const text = encodeURIComponent("Kunjungi Pameran Foto Jurnalistik 'Bingkai Bisu' - Fixlens Festival 2026 di Hetero Space Banyumas (29-30 Nov 2026). Pesan tiketnya sekarang di: " + window.location.href);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

document.addEventListener("DOMContentLoaded", () => {
  const logoEl = document.getElementById("stealthLogo");
  const copyrightEl = document.getElementById("stealthCopyright");

  if (logoEl) logoEl.addEventListener("click", handleStealthTapEvent);
  if (copyrightEl) copyrightEl.addEventListener("click", handleStealthTapEvent);

  selectTicketVariant("tiket_1hari");
  refreshTicketStock(false);
  if (window.lucide) lucide.createIcons();
});

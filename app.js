
/* =====================================================
   NARU STORES - COMPLETE APP.JS
   Marketplace | Images | Files | Likes | Rewards
   Wallet | Withdrawals | Econet | NetOne
===================================================== */

const SUPABASE_URL = "https://fsrosklmmmfprpczmdyr.supabase.co";
const SUPABASE_KEY = "sb_publishable_KfHVYeZwnFSIy_fUpTN7zg_NajdmGNm";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let currentUser = null;
let currentProducts = [];

// ================= HELPERS =================

const $ = id => document.getElementById(id);

function notify(message) {
  const toast = $("toast");
  if (!toast) return alert(message);

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(notify.timer);
  notify.timer = setTimeout(
    () => toast.classList.remove("show"), 3000
  );
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function formatMoney(amount) {
  return "$" + Number(amount || 0).toFixed(2);
}

function showMessage(id, message, error = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = error ? "#dc3545" : "#168a58";
}

function getPrice(description = "") {
  const match = description.match(/^Price: (.+)$/m);
  return match ? match[1] : "Free";
}

function getDescription(description = "") {
  return description.replace(/^Price: .+\n*/m, "").trim();
}

// ================= AUTHENTICATION =================

let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;

  document.querySelectorAll("[data-tab]").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === mode);
  });

  if ($("authSubmit")) {
    $("authSubmit").textContent =
      mode === "login" ? "Log in" : "Create account";
  }
}

document.querySelectorAll("[data-tab]").forEach(tab => {
  tab.addEventListener("click", () =>
    setAuthMode(tab.dataset.tab)
  );
});

$("authForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;

  $("authSubmit").disabled = true;
  showMessage("authMessage", "Please wait...");

  try {
    if (authMode === "signup") {
      const { data, error } = await db.auth.signUp({
        email,
        password
      });

      if (error) throw error;

      if (data.session) {
        await startApp(data.user);
      } else {
        showMessage(
          "authMessage",
          "Account created. Please confirm your email."
        );
      }
    } else {
      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      await startApp(data.user);
    }
  } catch (error) {
    showMessage("authMessage", error.message, true);
  } finally {
    $("authSubmit").disabled = false;
  }
});

// ================= NAVIGATION =================

function showPage(page) {
  document.querySelectorAll(".page").forEach(section =>
    section.classList.add("hidden")
  );

  $("page-" + page)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  if (page === "home") loadStoreFiles();
  if (page === "mine") loadMyProducts();
  if (page === "wallet") refreshWallet();
}

document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () =>
    showPage(button.dataset.page)
  );
});

// ================= START APP =================

async function startApp(user) {
  currentUser = user;

  $("authScreen")?.classList.add("hidden");
  $("app")?.classList.remove("hidden");

  if ($("userEmail")) {
    $("userEmail").textContent = user.email || "";
  }

  // Allow all file extensions
  const fileInput = $("productImage");

  if (fileInput) {
    fileInput.type = "file";
    fileInput.removeAttribute("accept");
  }

  await loadStoreFiles();
  await refreshWallet();
  await loadWithdrawalHistory();

  showPage("home");
}

// ================= LOGOUT =================

$("logoutBtn")?.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) return notify(error.message);

  currentUser = null;

  $("app")?.classList.add("hidden");
  $("authScreen")?.classList.remove("hidden");

  notify("Logged out successfully.");
});

// ================= CHECK LOGIN =================

async function checkLogin() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error(error);
    return;
  }

  if (data.session) {
    await startApp(data.session.user);
  } else {
    $("authScreen")?.classList.remove("hidden");
    $("app")?.classList.add("hidden");
  }
}

// =====================================================
// FILE UPLOAD - ALL COMMON FILE FORMATS
// =====================================================

const MAX_FILE_SIZE = 50 * 1024 * 1024;

async function uploadStoreFile(file, description = "", productName = "") {
  if (!currentUser) throw new Error("Please sign in first.");
  if (!file) throw new Error("Choose a file.");

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Maximum file size is 50 MB.");
  }

  const safeName = file.name.replace(
    /[^a-zA-Z0-9._-]/g, "_"
  );

  const path =
    `${currentUser.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await db.storage
    .from("product-files")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { data, error } = await db
    .from("products")
    .insert({
      user_id: currentUser.id,
      file_name: productName || file.name,
      file_path: path,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size,
      description
    })
    .select()
    .single();

  if (error) {
    await db.storage.from("product-files").remove([path]);
    throw error;
  }

  return data;
}

// ================= PUBLISH FILE =================

$("productForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const name = $("productName").value.trim();
  const price = $("productPrice").value.trim();
  const description = $("productDescription").value.trim();
  const file = $("productImage").files[0];

  if (!file) {
    return showMessage(
      "uploadMessage", "Choose a file first.", true
    );
  }

  const button = $("productForm").querySelector(
    'button[type="submit"]'
  );

  button.disabled = true;
  showMessage("uploadMessage", "Uploading...");

  try {
    await uploadStoreFile(
      file,
      `Price: ${price}\n\n${description}`,
      name
    );

    $("productForm").reset();

    showMessage("uploadMessage", "File uploaded successfully!");
    notify("Your file has been published.");

    await loadStoreFiles();
    showPage("home");
  } catch (error) {
    showMessage("uploadMessage", error.message, true);
  } finally {
    button.disabled = false;
  }
});

// =====================================================
// IMAGE PREVIEW AND FILE ICONS
// =====================================================

function isImage(product) {
  const mime = (product.mime_type || "").toLowerCase();
  const name = (product.file_name || "").toLowerCase();

  return mime.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|bmp|ico|svg)$/.test(name);
}

function fileIcon(product) {
  const name = (product.file_name || "").toLowerCase();

  if (/\.(jpg|jpeg|png|gif|webp|bmp|ico|svg)$/.test(name)) return "🖼️";
  if (/\.(mp4|mkv|avi|mov|webm)$/.test(name)) return "🎬";
  if (/\.(mp3|wav|ogg|m4a)$/.test(name)) return "🎵";
  if (/\.(pdf)$/.test(name)) return "📕";
  if (/\.(apk)$/.test(name)) return "📱";
  if (/\.(zip|rar|7z)$/.test(name)) return "🗜️";
  if (/\.(doc|docx|txt)$/.test(name)) return "📄";

  return "📁";
}

// =====================================================
// MARKETPLACE
// =====================================================

async function loadStoreFiles() {
  if (!currentUser) return;

  const grid = $("productGrid");
  if (!grid) return;

  grid.innerHTML = "<p>Loading files...</p>";

  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    currentProducts = data || [];

    const { data: likes, error: likeError } = await db
      .from("product_likes")
      .select("product_id,user_id");

    if (likeError) throw likeError;

    const likedIds = new Set(
      likes
        .filter(item => item.user_id === currentUser.id)
        .map(item => item.product_id)
    );

    grid.innerHTML = "";

    if (!currentProducts.length) {
      grid.innerHTML = "<p>No files uploaded yet.</p>";
      return;
    }

    for (const product of currentProducts) {
      const image = isImage(product);
      let preview = "";

      if (image) {
        const { data: signed } = await db.storage
          .from("product-files")
          .createSignedUrl(product.file_path, 3600);

        preview = signed?.signedUrl
          ? `<img class="product-image" src="${escapeHTML(signed.signedUrl)}" alt="${escapeHTML(product.file_name)}" loading="lazy">`
          : `<div class="file-preview">🖼️ Image preview unavailable</div>`;
      } else {
        preview = `<div class="file-preview">${fileIcon(product)}<br>${escapeHTML(product.mime_type || "File")}</div>`;
      }

      const card = document.createElement("article");
      card.className = "product-card";

      card.innerHTML = `
        ${preview}
        <div class="product-info">
          <h3>${escapeHTML(product.file_name)}</h3>
          <p class="price">${escapeHTML(getPrice(product.description || ""))}</p>
          <p>${escapeHTML(getDescription(product.description || ""))}</p>
          <p>${Number(product.likes_count || 0)} likes</p>
          <div class="card-bottom">
            <button class="like-btn"
              data-like="${product.id}"
              ${likedIds.has(product.id) || product.user_id === currentUser.id ? "disabled" : ""}>
              ${likedIds.has(product.id) ? "♥ Liked" : "♥ Like"}
            </button>
            <button class="outline" data-download="${product.id}">
              Download
            </button>
          </div>
        </div>
      `;

      grid.appendChild(card);
    }
  } catch (error) {
    grid.innerHTML =
      `<p>Error: ${escapeHTML(error.message)}</p>`;
  }
}

// =====================================================
// LIKES - $1 PER VERIFIED UNIQUE LIKE
// =====================================================

async function likeStoreFile(productId) {
  if (!currentUser) throw new Error("Please sign in.");

  const { data, error } = await db.rpc("like_product", {
    p_product_id: productId
  });

  if (error) throw error;

  return data;
}

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-like]");
  if (!button) return;

  button.disabled = true;

  try {
    const result = await likeStoreFile(button.dataset.like);

    notify(
      result === "Already liked"
        ? "You already liked this file."
        : "Like successful! Owner received a $1 wallet credit."
    );

    await loadStoreFiles();
    await refreshWallet();
  } catch (error) {
    notify(error.message);
    button.disabled = false;
  }
});

// =====================================================
// DOWNLOAD FILES
// =====================================================

async function downloadStoreFile(filePath, fileName = "download") {
  const { data, error } = await db.storage
    .from("product-files")
    .createSignedUrl(filePath, 300, {
      download: fileName
    });

  if (error) throw error;

  const link = document.createElement("a");
  link.href = data.signedUrl;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  link.remove();
}

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-download]");
  if (!button) return;

  const product = currentProducts.find(
    item => item.id === button.dataset.download
  );

  if (!product) return notify("File not found.");

  button.disabled = true;

  try {
    await downloadStoreFile(
      product.file_path,
      product.file_name
    );
  } catch (error) {
    notify(error.message);
  } finally {
    button.disabled = false;
  }
});

// =====================================================
// MY PRODUCTS
// =====================================================

async function loadMyProducts() {
  if (!currentUser) return;

  const grid = $("myProducts");
  if (!grid) return;

  grid.innerHTML = "<p>Loading...</p>";

  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    grid.innerHTML = "";

    if (!data.length) {
      grid.innerHTML = "<p>You haven't uploaded files yet.</p>";
      return;
    }

    data.forEach(product => {
      const card = document.createElement("article");
      card.className = "product-card";

      card.innerHTML = `
        <div class="product-info">
          <h3>${fileIcon(product)} ${escapeHTML(product.file_name)}</h3>
          <p>${Number(product.likes_count || 0)} likes</p>
          <button class="outline" data-download="${product.id}">
            Download
          </button>
        </div>
      `;

      grid.appendChild(card);
    });
  } catch (error) {
    grid.innerHTML = escapeHTML(error.message);
  }
}

// =====================================================
// WALLET
// =====================================================

async function getStoreWallet() {
  if (!currentUser) throw new Error("Please sign in.");

  const { data, error } = await db
    .from("wallets")
    .select("balance")
    .eq("user_id", currentUser.id)
    .single();

  if (error) throw error;

  return Number(data.balance);
}

async function refreshWallet() {
  try {
    const balance = await getStoreWallet();

    if ($("balance")) {
      $("balance").textContent = formatMoney(balance);
    }
  } catch (error) {
    console.error(error);
  }
}

// =====================================================
// WITHDRAWAL REQUESTS
// =====================================================

async function withdrawStoreMoney(amount, phone, network) {
  if (!currentUser) throw new Error("Please sign in.");

  const { data, error } = await db.rpc(
    "request_withdrawal",
    {
      p_amount: Number(amount),
      p_phone: phone.trim(),
      p_network: network
    }
  );

  if (error) throw error;

  return data;
}

$("withdrawForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const amount = Number($("withdrawAmount").value);
  const phone = $("phone").value.trim();
  const network = $("network").value;

  const button = $("withdrawForm").querySelector(
    'button[type="submit"]'
  );

  button.disabled = true;
  showMessage("withdrawMessage", "Processing request...");

  try {
    const reference = await withdrawStoreMoney(
      amount, phone, network
    );

    showMessage(
      "withdrawMessage",
      `Your ${formatMoney(amount)} withdrawal request has been received. It will be sent to your phone line after payment processing.`
    );

    notify("Withdrawal request submitted!");

    $("withdrawForm").reset();

    await refreshWallet();
    await loadWithdrawalHistory();

    console.log("Withdrawal reference:", reference);
  } catch (error) {
    showMessage("withdrawMessage", error.message, true);
  } finally {
    button.disabled = false;
  }
});

// =====================================================
// WITHDRAWAL HISTORY
// =====================================================

async function loadWithdrawalHistory() {
  if (!currentUser) return;

  const container = $("withdrawals");
  if (!container) return;

  container.innerHTML = "<p>Loading withdrawals...</p>";

  try {
    const { data, error } = await db
      .from("withdrawals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    container.innerHTML = "";

    if (!data.length) {
      container.innerHTML = "<p>No withdrawals yet.</p>";
      return;
    }

    data.forEach(item => {
      const row = document.createElement("div");
      row.className = "request";

      row.innerHTML = `
        <strong>${formatMoney(item.amount)}</strong>
        <p>${escapeHTML(item.network)} - ${escapeHTML(item.phone_number)}</p>
        <small>${new Date(item.created_at).toLocaleString()}</small>
        <span class="status">${escapeHTML(item.status.toUpperCase())}</span>
      `;

      container.appendChild(row);
    });
  } catch (error) {
    container.innerHTML = escapeHTML(error.message);
  }
}

// =====================================================
// REFRESH
// =====================================================

$("refreshBtn")?.addEventListener("click", loadStoreFiles);

document.querySelector(".brand")?.addEventListener("click", event => {
  event.preventDefault();
  showPage("home");
});

// =====================================================
// AUTH SESSION
// =====================================================

checkLogin();

db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    $("app")?.classList.add("hidden");
    $("authScreen")?.classList.remove("hidden");
  }
});

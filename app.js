
// =====================================================
// NARU STORES - COMPLETE WEBSITE APPLICATION
// Login | Marketplace | Uploads | Likes | $1 Rewards
// Wallet | Econet | NetOne | Withdrawal History
// =====================================================

// SUPABASE CONFIGURATION
const SUPABASE_URL = "https://fsrosklmmmfprpczmdyr.supabase.co";
const SUPABASE_KEY = "sb_publishable_KfHVYeZwnFSIy_fUpTN7zg_NajdmGNm";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let currentUser = null;
let authMode = "login";
let currentProducts = [];

// SHORTCUTS
const $ = id => document.getElementById(id);

function notify(message) {
  const toast = $("toast");
  if (!toast) {
    alert(message);
    return;
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(
    () => toast.classList.remove("show"), 3000
  );
}

function showMessage(id, message, error = false) {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  element.style.color = error ? "#c0392b" : "#168a58";
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatMoney(amount) {
  return "$" + Number(amount || 0).toFixed(2);
}

function getPrice(description = "") {
  const match = description.match(/^Price: (.+)$/m);
  return match ? match[1] : "Contact seller";
}

function getDescription(description = "") {
  return description.replace(/^Price: .+\n*/m, "").trim();
}

// AUTHENTICATION
function setAuthMode(mode) {
  authMode = mode;

  document.querySelectorAll("[data-tab]").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === mode);
  });

  if ($("authSubmit")) {
    $("authSubmit").textContent =
      mode === "login" ? "Log in" : "Create account";
  }

  showMessage("authMessage", "");
}

document.querySelectorAll("[data-tab]").forEach(tab => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.tab));
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
        notify("Account created successfully!");
        await startApp(data.user);
      } else {
        showMessage(
          "authMessage",
          "Account created. Check your email to confirm your account."
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

// SHOW AND HIDE PAGES
function showPage(page) {
  document.querySelectorAll(".page").forEach(section => {
    section.classList.add("hidden");
  });

  $("page-" + page)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  if (page === "home") loadStoreFiles();
  if (page === "mine") loadMyProducts();
  if (page === "wallet") refreshWallet();
}

document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

// START WEBSITE AFTER LOGIN
async function startApp(user) {
  currentUser = user;

  $("authScreen")?.classList.add("hidden");
  $("app")?.classList.remove("hidden");

  if ($("userEmail")) {
    $("userEmail").textContent = user.email || "";
  }

  if ($("year")) {
    $("year").textContent = new Date().getFullYear();
  }

  // Allow any file type in the existing upload input.
  if ($("productImage")) {
    $("productImage").removeAttribute("accept");
    $("productImage").type = "file";
  }

  await loadStoreFiles();
  await refreshWallet();
  await loadWithdrawalHistory();

  showPage("home");
}

// LOG OUT
$("logoutBtn")?.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) return notify(error.message);

  currentUser = null;
  $("app")?.classList.add("hidden");
  $("authScreen")?.classList.remove("hidden");
  notify("You have logged out.");
});

// CHECK EXISTING LOGIN
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
// FILE UPLOAD
// =====================================================

async function uploadStoreFile(file, description = "", productName = "") {
  if (!currentUser) throw new Error("Please sign in first");
  if (!file) throw new Error("Choose a file first");

  // 50 MB upload limit
  if (file.size > 50 * 1024 * 1024) {
    throw new Error("Maximum file size is 50 MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${currentUser.id}/${Date.now()}-${safeName}`;

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

// PUBLISH PRODUCT OR FILE
$("productForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const name = $("productName").value.trim();
  const price = $("productPrice").value.trim();
  const description = $("productDescription").value.trim();
  const file = $("productImage").files[0];

  if (!file) {
    return showMessage("uploadMessage", "Choose a file first.", true);
  }

  const button = $("productForm").querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage("uploadMessage", "Uploading your file...");

  try {
    await uploadStoreFile(
      file,
      `Price: ${price}\n\n${description}`,
      name
    );

    $("productForm").reset();
    showMessage("uploadMessage", "Your file has been published!");
    notify("Upload successful!");

    await loadStoreFiles();
    showPage("home");
  } catch (error) {
    showMessage("uploadMessage", error.message, true);
  } finally {
    button.disabled = false;
  }
});

// =====================================================
// LOAD MARKETPLACE
// =====================================================

async function loadStoreFiles() {
  if (!currentUser) return;

  const grid = $("productGrid");
  if (!grid) return;

  grid.innerHTML = "<p>Loading products...</p>";

  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    currentProducts = data || [];

    const { data: likes, error: likesError } = await db
      .from("product_likes")
      .select("product_id, user_id");

    if (likesError) throw likesError;

    const likedIds = new Set(
      likes
        .filter(like => like.user_id === currentUser.id)
        .map(like => like.product_id)
    );

    grid.innerHTML = "";

    if (!currentProducts.length) {
      $("emptyProducts")?.classList.remove("hidden");
      return;
    }

    $("emptyProducts")?.classList.add("hidden");

    for (const product of currentProducts) {
      const isImage = product.mime_type?.startsWith("image/");
      let preview = "";

      const { data: signed } = await db.storage
        .from("product-files")
        .createSignedUrl(product.file_path, 3600);

      if (isImage && signed?.signedUrl) {
        preview = `<img src="${signed.signedUrl}" alt="${escapeHTML(product.file_name)}">`;
      } else {
        preview = `<div class="file-preview">📁<br>${escapeHTML(product.mime_type || "File")}</div>`;
      }

      const card = document.createElement("article");
      card.className = "product-card";

      card.innerHTML = `
        ${preview}
        <div class="product-info">
          <h3>${escapeHTML(product.file_name)}</h3>
          <p class="price">${escapeHTML(getPrice(product.description || ""))}</p>
          <p class="description">${escapeHTML(getDescription(product.description || ""))}</p>
          <p class="seller">Uploaded by ${product.user_id === currentUser.id ? "You" : "Community member"}</p>
          <p class="seller">${Number(product.likes_count || 0)} likes</p>
          <div class="card-bottom">
            <button class="like-btn ${likedIds.has(product.id) ? "liked" : ""}"
              data-like="${product.id}"
              ${likedIds.has(product.id) || product.user_id === currentUser.id ? "disabled" : ""}>
              ♥ ${likedIds.has(product.id) ? "Liked" : "Like"}
            </button>
            <button class="outline" data-download="${product.id}">Download</button>
          </div>
        </div>
      `;

      grid.appendChild(card);
    }
  } catch (error) {
    grid.innerHTML = `<p>Could not load files: ${escapeHTML(error.message)}</p>`;
  }
}

// =====================================================
// UNIQUE LIKE - OWNER GETS $1
// =====================================================

async function likeStoreFile(productId) {
  if (!currentUser) throw new Error("Please sign in first");

  const { data, error } = await db.rpc("like_product", {
    p_product_id: productId
  });

  if (error) throw error;

  return data;
}

// LIKE BUTTON
document.addEventListener("click", async event => {
  const button = event.target.closest("[data-like]");
  if (!button) return;

  button.disabled = true;

  try {
    const result = await likeStoreFile(button.dataset.like);

    if (result === "Already liked") {
      notify("You have already liked this file.");
    } else {
      notify("Like successful! The owner earned $1.");
    }

    await loadStoreFiles();
    await refreshWallet();
  } catch (error) {
    notify(error.message);
    button.disabled = false;
  }
});

// =====================================================
// DOWNLOAD FILE
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
    await downloadStoreFile(product.file_path, product.file_name);
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

  grid.innerHTML = "<p>Loading your products...</p>";

  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    grid.innerHTML = "";

    if (!data.length) {
      $("emptyMine")?.classList.remove("hidden");
      return;
    }

    $("emptyMine")?.classList.add("hidden");

    data.forEach(product => {
      const card = document.createElement("article");
      card.className = "product-card";

      card.innerHTML = `
        <div class="product-info">
          <h3>${escapeHTML(product.file_name)}</h3>
          <p class="price">${escapeHTML(getPrice(product.description || ""))}</p>
          <p>${Number(product.likes_count || 0)} likes earned</p>
          <p class="seller">${escapeHTML(product.mime_type || "File")}</p>
          <button class="outline" data-download="${product.id}">Download my file</button>
        </div>
      `;

      grid.appendChild(card);
    });
  } catch (error) {
    grid.innerHTML = `<p>${escapeHTML(error.message)}</p>`;
  }
}

// =====================================================
// WALLET BALANCE
// =====================================================

async function getStoreWallet() {
  if (!currentUser) throw new Error("Please sign in");

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
    console.error("Wallet error:", error);
  }
}

// =====================================================
// WITHDRAWAL REQUEST
// =====================================================

async function withdrawStoreMoney(amount, phone, network) {
  if (!currentUser) throw new Error("Please sign in");

  const { data, error } = await db.rpc("request_withdrawal", {
    p_amount: Number(amount),
    p_phone: phone.trim(),
    p_network: network
  });

  if (error) throw error;

  return data;
}

$("withdrawForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const amount = Number($("withdrawAmount").value);
  const phone = $("phone").value.trim();
  const network = $("network").value;

  const button = $("withdrawForm").querySelector('button[type="submit"]');
  button.disabled = true;

  showMessage("withdrawMessage", "Submitting withdrawal request...");

  try {
    const id = await withdrawStoreMoney(amount, phone, network);

    showMessage(
      "withdrawMessage",
      `Your ${formatMoney(amount)} withdrawal request has been received. It will be sent to your phone line after processing.`
    );

    notify("Withdrawal request submitted!");

    $("withdrawForm").reset();
    $("withdrawAmount").value = "1";

    await refreshWallet();
    await loadWithdrawalHistory();

    console.log("Withdrawal reference:", id);
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

  container.innerHTML = "<p>Loading requests...</p>";

  try {
    const { data, error } = await db
      .from("withdrawals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    container.innerHTML = "";

    if (!data.length) {
      container.innerHTML = "<p>No withdrawal requests yet.</p>";
      return;
    }

    data.forEach(item => {
      const row = document.createElement("div");
      row.className = "request";

      row.innerHTML = `
        <div>
          <strong>${formatMoney(item.amount)}</strong>
          <div>${escapeHTML(item.network)} · ${escapeHTML(item.phone_number)}</div>
          <small>${new Date(item.created_at).toLocaleString()}</small>
        </div>
        <span class="status">${escapeHTML(item.status.toUpperCase())}</span>
      `;

      container.appendChild(row);
    });
  } catch (error) {
    container.innerHTML = `<p>${escapeHTML(error.message)}</p>`;
  }
}

// REFRESH BUTTON
$("refreshBtn")?.addEventListener("click", loadStoreFiles);

// HOME LINK
document.querySelector(".brand")?.addEventListener("click", event => {
  event.preventDefault();
  showPage("home");
});

// =====================================================
// START
// =====================================================

checkLogin();

db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    $("app")?.classList.add("hidden");
    $("authScreen")?.classList.remove("hidden");
  }
});

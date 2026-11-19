// ==========================================
// NARU STORES - MAIN APPLICATION
// ==========================================

const SUPABASE_URL = "https://fsrosklmmmfprpczmdyr.supabase.co";
const SUPABASE_KEY = "sb_publishable_KfHVYeZwnFSIy_fUpTN7zg_NajdmGNm";
const BUCKET = "product-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let authMode = "login";
let productsCache = [];

const $ = id => document.getElementById(id);

function message(id, text, success = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("success", success);
}

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

function setLoading(button, loading, text = "Please wait...") {
  if (!button) return;
  if (loading) {
    button.dataset.oldText = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.oldText || button.textContent;
    button.disabled = false;
  }
}

function showAuth() {
  $("authScreen").classList.remove("hidden");
  $("app").classList.add("hidden");
}

function showApp() {
  $("authScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("userEmail").textContent = currentUser?.email || "";
  $("year").textContent = new Date().getFullYear();
}

function showPage(page) {
  document.querySelectorAll(".page").forEach(section => {
    section.classList.add("hidden");
  });

  const target = $("page-" + page);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  if (page === "home") loadProducts();
  if (page === "mine") loadMyProducts();
  if (page === "wallet") loadWallet();
}

// ------------------------------------------
// LOGIN AND SIGNUP
// ------------------------------------------

document.querySelectorAll("[data-tab]").forEach(button => {
  button.addEventListener("click", () => {
    authMode = button.dataset.tab;

    document.querySelectorAll("[data-tab]").forEach(tab => {
      tab.classList.toggle("active", tab === button);
    });

    $("authSubmit").textContent =
      authMode === "login" ? "Login" : "Create account";

    message("authMessage", "");
  });
});

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("authSubmit");
  const email = $("email").value.trim();
  const password = $("password").value;

  setLoading(button, true);

  try {
    let result;

    if (authMode === "signup") {
      result = await db.auth.signUp({ email, password });
    } else {
      result = await db.auth.signInWithPassword({ email, password });
    }

    if (result.error) throw result.error;

    if (authMode === "signup" && !result.data.session) {
      message(
        "authMessage",
        "Account created. Check your email to confirm it.",
        true
      );
    } else {
      message("authMessage", "Welcome!", true);
    }
  } catch (error) {
    message("authMessage", error.message || "Authentication failed.");
  } finally {
    setLoading(button, false);
  }
});

$("logoutBtn").addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) return toast(error.message);
  currentUser = null;
  showAuth();
});

// ------------------------------------------
// NAVIGATION
// ------------------------------------------

document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

$("refreshBtn").addEventListener("click", loadProducts);

// ------------------------------------------
// FILE UPLOAD
// ------------------------------------------

function safeFileName(name) {
  return name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-120) || "upload";
}

$("productForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return message("uploadMessage", "Please log in first.");

  const button = event.submitter;
  const file = $("productImage").files[0];

  if (!file) return message("uploadMessage", "Choose a file first.");

  if (file.size > MAX_FILE_SIZE) {
    return message("uploadMessage", "File is too large. Maximum size is 50 MB.");
  }

  const name = $("productName").value.trim();
  const price = $("productPrice").value.trim();
  const description = $("productDescription").value.trim();

  if (!name || !price || !description) {
    return message("uploadMessage", "Complete all product details.");
  }

  setLoading(button, true, "Uploading...");
  message("uploadMessage", "");

  const filePath =
    currentUser.id + "/" + Date.now() + "_" + safeFileName(file.name);

  try {
    const upload = await db.storage
      .from(BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });

    if (upload.error) throw upload.error;

    const insert = await db.from("products").insert({
      user_id: currentUser.id,
      name,
      price,
      description,
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream"
    });

    if (insert.error) {
      // Remove uploaded file if the database insert fails.
      await db.storage.from(BUCKET).remove([filePath]);
      throw insert.error;
    }

    $("productForm").reset();
    message("uploadMessage", "Product published successfully!", true);
    toast("Product published!");
    showPage("mine");
  } catch (error) {
    message("uploadMessage", error.message || "Upload failed.");
  } finally {
    setLoading(button, false);
  }
});

// ------------------------------------------
// FILE URL AND PRODUCT CARDS
// ------------------------------------------

async function getFileUrl(path, downloadName = null) {
  const options = downloadName ? { download: downloadName } : {};

  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600, options);

  if (error) throw error;
  return data.signedUrl;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

async function makeProductCard(product) {
  const imageType = (product.mime_type || "").startsWith("image/");
  let media = `<div class="product-media">📁</div>`;

  try {
    const url = await getFileUrl(product.file_path);

    if (imageType) {
      media = `
        <div class="product-media">
          <img src="${escapeHTML(url)}" alt="${escapeHTML(product.name)}">
        </div>`;
    }
  } catch (error) {
    console.warn("Could not load product preview:", error.message);
  }

  const card = document.createElement("article");
  card.className = "product-card";

  card.innerHTML = `
    ${media}
    <div class="product-info">
      <h3>${escapeHTML(product.name)}</h3>
      <div class="product-price">${escapeHTML(product.price)}</div>
      <p class="product-description">${escapeHTML(product.description)}</p>
      <p class="hint">Likes: ${Number(product.likes_count || 0)}</p>
      <div class="product-actions">
        <button class="action-btn like-btn" type="button">♡ Like</button>
        <button class="action-btn download-btn" type="button">Download</button>
      </div>
    </div>
  `;

  card.querySelector(".like-btn").addEventListener("click", async () => {
    const { error } = await db.rpc("like_product", {
      p_product_id: product.id
    });

    if (error) return toast(error.message);

    toast("Like added!");
    loadProducts();
  });

  card.querySelector(".download-btn").addEventListener("click", async () => {
    try {
      const url = await getFileUrl(product.file_path, product.file_name);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast(error.message || "Download failed.");
    }
  });

  return card;
}

// ------------------------------------------
// MARKETPLACE
// ------------------------------------------

async function loadProducts() {
  const grid = $("productGrid");
  grid.innerHTML = "<p>Loading products...</p>";

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    grid.innerHTML = "";
    toast(error.message);
    return;
  }

  productsCache = data || [];
  grid.innerHTML = "";

  $("emptyProducts").classList.toggle("hidden", productsCache.length > 0);

  for (const product of productsCache) {
    grid.appendChild(await makeProductCard(product));
  }
}

// ------------------------------------------
// MY PRODUCTS
// ------------------------------------------

async function loadMyProducts() {
  const grid = $("myProducts");
  grid.innerHTML = "<p>Loading your products...</p>";

  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    grid.innerHTML = "";
    toast(error.message);
    return;
  }

  grid.innerHTML = "";
  $("emptyMine").classList.toggle("hidden", (data || []).length > 0);

  for (const product of (data || [])) {
    grid.appendChild(await makeProductCard(product));
  }
}

// ------------------------------------------
// WALLET
// ------------------------------------------

async function loadWallet() {
  const { data, error } = await db
    .from("wallets")
    .select("balance")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    toast(error.message);
    return;
  }

  $("balance").textContent =
    "$" + Number(data?.balance || 0).toFixed(2);

  const history = $("withdrawals");
  history.innerHTML = "<p>Loading...</p>";

  const result = await db
    .from("withdrawals")
    .select("amount,network,phone,status,created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (result.error) {
    history.textContent = result.error.message;
    return;
  }

  history.innerHTML = "";

  if (!result.data.length) {
    history.textContent = "No withdrawal requests yet.";
    return;
  }

  result.data.forEach(item => {
    const row = document.createElement("div");
    row.className = "history-item";
    row.textContent =
      `${item.network} · ${item.phone} · $${Number(item.amount).toFixed(2)} · ${item.status}`;
    history.appendChild(row);
  });
}

$("withdrawForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = event.submitter;
  const amount = Number($("withdrawAmount").value);
  const phone = $("phone").value.trim();
  const network = $("network").value;

  if (!Number.isFinite(amount) || amount <= 0) {
    return message("withdrawMessage", "Enter a valid amount.");
  }

  if (!phone) {
    return message("withdrawMessage", "Enter your phone number.");
  }

  setLoading(button, true, "Submitting...");

  try {
    const { error } = await db.rpc("request_withdrawal", {
      p_amount: amount,
      p_phone: phone,
      p_network: network
    });

    if (error) throw error;

    $("withdrawForm").reset();
    message(
      "withdrawMessage",
      "Your request was submitted. Airtime is not sent automatically; an administrator must process it.",
      true
    );

    await loadWallet();
  } catch (error) {
    message("withdrawMessage", error.message || "Request failed.");
  } finally {
    setLoading(button, false);
  }
});

// ------------------------------------------
// AUTH SESSION
// ------------------------------------------

async function startApp() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error(error);
    showAuth();
    return;
  }

  currentUser = data.session?.user || null;

  if (currentUser) {
    showApp();
    showPage("home");
  } else {
    showAuth();
  }
}

db.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;

  if (currentUser) {
    showApp();
    showPage("home");
  } else {
    showAuth();
  }
});

startApp();

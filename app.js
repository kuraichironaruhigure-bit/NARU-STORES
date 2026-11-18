
/* ==========================================
   NARU STORES
   COMPLETE MARKETPLACE APPLICATION
   Supabase authentication, uploads, likes,
   rewards, wallet and withdrawal requests
========================================== */

// ==========================================
// 1. SUPABASE CONFIGURATION
// ==========================================

const SUPABASE_URL = "https://fsrosklmmmfprpczmdyr.supabase.co";

const SUPABASE_KEY = "sb_publishable_KfHVYeZwnFSIy_fUpTN7zg_NajdmGNm";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const STORAGE_BUCKET = "product-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

let currentUser = null;
let authMode = "login";
let selectedFile = null;
let productsCache = [];

// ==========================================
// 2. GENERAL HELPERS
// ==========================================

function $(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function money(value) {
  return "$" + Number(value || 0).toFixed(2);
}

function toast(message) {
  const element = $("toast");

  if (element) {
    element.textContent = message;
    element.classList.add("show");

    setTimeout(() => {
      element.classList.remove("show");
    }, 3500);
  } else {
    alert(message);
  }
}

function setLoading(button, loading, originalText = "Submit") {
  if (!button) return;

  button.disabled = loading;
  button.textContent = loading ? "Please wait..." : originalText;
}

// ==========================================
// 3. AUTHENTICATION
// ==========================================

async function registerUser(email, password) {
  const { data, error } = await db.auth.signUp({
    email,
    password
  });

  if (error) throw error;

  return data;
}

async function loginUser(email, password) {
  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  return data;
}

async function logoutUser() {
  const { error } = await db.auth.signOut();

  if (error) {
    toast(error.message);
    return;
  }

  currentUser = null;
  showAuth();
}

function showAuth() {
  if ($("authScreen")) {
    $("authScreen").style.display = "flex";
  }

  if ($("app")) {
    $("app").style.display = "none";
  }
}

function showApp() {
  if ($("authScreen")) {
    $("authScreen").style.display = "none";
  }

  if ($("app")) {
    $("app").style.display = "block";
  }

  if ($("userEmail")) {
    $("userEmail").textContent = currentUser.email;
  }
}

async function handleAuth(event) {
  event.preventDefault();

  const email = $("email")?.value.trim();
  const password = $("password")?.value;
  const button = $("authSubmit");

  if (!email || !password) {
    toast("Enter your email and password.");
    return;
  }

  setLoading(button, true);

  try {
    if (authMode === "register") {
      await registerUser(email, password);
      toast("Account created. Check your email if confirmation is required.");
    } else {
      await loginUser(email, password);
      toast("Welcome to NARU STORES!");
    }
  } catch (error) {
    toast(error.message);
  } finally {
    setLoading(button, false, authMode === "login" ? "Login" : "Register");
  }
}

function toggleAuthMode() {
  authMode = authMode === "login" ? "register" : "login";

  if ($("authSubmit")) {
    $("authSubmit").textContent =
      authMode === "login" ? "Login" : "Register";
  }

  if ($("authTitle")) {
    $("authTitle").textContent =
      authMode === "login" ? "Welcome Back" : "Create Account";
  }
}

// ==========================================
// 4. FILE UPLOAD SYSTEM
// ==========================================

function validateFile(file) {
  if (!file) {
    throw new Error("Please select a file.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File is too large. Maximum size is 50MB.");
  }

  if (!file.name) {
    throw new Error("Invalid filename.");
  }

  return true;
}

function safeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .substring(0, 150);
}

async function uploadStoreFile(file) {
  validateFile(file);

  const path =
    currentUser.id + "/" +
    Date.now() + "_" +
    safeFilename(file.name);

  const { data, error } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream"
    });

  if (error) throw error;

  return {
    file_path: data.path,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type || "application/octet-stream"
  };
}

// ==========================================
// 5. PRODUCT PUBLISHING
// ==========================================

async function publishProduct(event) {
  event.preventDefault();

  if (!currentUser) {
    toast("Please login first.");
    return;
  }

  const name = $("productName")?.value.trim();
  const price = Number($("productPrice")?.value || 0);
  const description = $("productDescription")?.value.trim();

  const file =
    selectedFile ||
    $("productImage")?.files?.[0];

  if (!name) {
    toast("Enter a product name.");
    return;
  }

  if (!file) {
    toast("Choose a product file.");
    return;
  }

  if (!Number.isFinite(price) || price < 0) {
    toast("Enter a valid price.");
    return;
  }

  const button = $("publishButton") ||
    $("productForm")?.querySelector('[type="submit"]');

  setLoading(button, true, "Publish Product");

  let uploadedPath = null;

  try {
    // Upload file first
    const uploaded = await uploadStoreFile(file);
    uploadedPath = uploaded.file_path;

    // IMPORTANT: name is included.
    const productData = {
      user_id: currentUser.id,
      name: name,
      price: price,
      description: description || "",
      file_path: uploaded.file_path,
      file_name: uploaded.file_name,
      file_size: uploaded.file_size,
      mime_type: uploaded.mime_type,
      likes_count: 0
    };

    const { error } = await db
      .from("products")
      .insert([productData]);

    if (error) throw error;

    toast("Product published successfully!");

    $("productForm")?.reset();
    selectedFile = null;

    await loadProducts();
    await loadMyProducts();

  } catch (error) {

    // Remove an uploaded file if product publishing fails.
    if (uploadedPath) {
      await db.storage
        .from(STORAGE_BUCKET)
        .remove([uploadedPath]);
    }

    console.error("Publishing error:", error);
    toast("Publishing failed: " + error.message);

  } finally {
    setLoading(button, false, "Publish Product");
  }
}

// ==========================================
// 6. PRODUCT FILE PREVIEW
// ==========================================

function handleFileSelection(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  try {
    validateFile(file);

    selectedFile = file;

    const preview = $("filePreview");

    if (preview) {
      preview.textContent =
        file.name + " (" +
        (file.size / 1024 / 1024).toFixed(2) +
        " MB)";
    }

  } catch (error) {
    selectedFile = null;
    event.target.value = "";
    toast(error.message);
  }
}

// ==========================================
// 7. DOWNLOAD PRODUCT FILES
// ==========================================

async function downloadProduct(path, filename) {
  try {
    const { data, error } = await db.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 300);

    if (error) throw error;

    const link = document.createElement("a");

    link.href = data.signedUrl;
    link.download = filename || "download";
    link.target = "_blank";

    document.body.appendChild(link);
    link.click();
    link.remove();

  } catch (error) {
    toast("Download failed: " + error.message);
  }
}

// ==========================================
// 8. PRODUCT DISPLAY
// ==========================================

function productCard(product) {
  const isOwner = product.user_id === currentUser?.id;

  const imageTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp"
  ];

  let preview = `
    <div class="file-icon">📁</div>
  `;

  if (imageTypes.includes(product.mime_type)) {
    preview = `
      <div class="file-icon">
        🖼️
      </div>
    `;
  }

  return `
    <div class="product-card">

      ${preview}

      <div class="product-info">

        <h3>${escapeHTML(product.name)}</h3>

        <p>${escapeHTML(product.description || "")}</p>

        <p class="product-price">
          ${money(product.price)}
        </p>

        <small>
          ${escapeHTML(product.file_name)}
        </small>

        <p>
          ❤️ ${Number(product.likes_count || 0)} Likes
        </p>

        <div class="product-actions">

          <button
            data-action="like"
            data-id="${escapeHTML(product.id)}"
            ${isOwner ? "disabled" : ""}
          >
            ❤️ Like
          </button>

          <button
            data-action="download"
            data-id="${escapeHTML(product.id)}"
          >
            Download
          </button>

        </div>

      </div>
    </div>
  `;
}

async function loadProducts() {
  const grid = $("productGrid");

  if (!grid) return;

  grid.innerHTML = "Loading products...";

  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    productsCache = data || [];

    grid.innerHTML = productsCache.length
      ? productsCache.map(productCard).join("")
      : "<p>No products published yet.</p>";

  } catch (error) {
    console.error(error);
    grid.innerHTML = "Could not load products.";
  }
}

// ==========================================
// 9. MY PRODUCTS
// ==========================================

async function loadMyProducts() {
  const container = $("myProducts");

  if (!container || !currentUser) return;

  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    container.innerHTML = data.length
      ? data.map(productCard).join("")
      : "<p>You have not published any products.</p>";

  } catch (error) {
    console.error(error);
    container.textContent = error.message;
  }
}

// ==========================================
// 10. LIKES AND REWARDS
// ==========================================

async function likeProduct(productId) {
  try {
    const product = productsCache.find(
      item => String(item.id) === String(productId)
    );

    if (!product) {
      throw new Error("Product not found.");
    }

    if (product.user_id === currentUser.id) {
      throw new Error("You cannot like your own product.");
    }

    // The database RPC must enforce unique likes
    // and award the product owner only once.
    const { error } = await db.rpc("like_product", {
      p_product_id: productId
    });

    if (error) throw error;

    toast("Like recorded successfully!");

    await loadProducts();
    await loadWallet();

  } catch (error) {
    toast(error.message);
  }
}

// ==========================================
// 11. WALLET BALANCE
// ==========================================

async function loadWallet() {
  if (!currentUser) return;

  try {
    const { data, error } = await db
      .from("wallets")
      .select("balance")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if ($("balance")) {
      $("balance").textContent = money(data?.balance || 0);
    }

  } catch (error) {
    console.error("Wallet error:", error);
  }
}

// ==========================================
// 12. TRANSACTION HISTORY
// ==========================================

async function loadTransactions() {
  const container = $("transactions");

  if (!container || !currentUser) return;

  try {
    const { data, error } = await db
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    container.innerHTML = (data || []).map(item => `
      <div class="transaction">
        <strong>${escapeHTML(item.type)}</strong>
        <span>${money(item.amount)}</span>
        <small>${escapeHTML(item.description || "")}</small>
      </div>
    `).join("") || "<p>No transactions yet.</p>";

  } catch (error) {
    console.error(error);
  }
}

// ==========================================
// 13. AIRTIME WITHDRAWALS
// ==========================================

async function requestWithdrawal(event) {
  event.preventDefault();

  if (!currentUser) return;

  const amount = Number($("withdrawAmount")?.value);
  const phone = $("phone")?.value.trim();
  const network = $("network")?.value;

  if (!Number.isFinite(amount) || amount < 1) {
    toast("Minimum withdrawal is $1.");
    return;
  }

  if (!phone) {
    toast("Enter your phone number.");
    return;
  }

  if (!["Econet", "NetOne"].includes(network)) {
    toast("Choose Econet or NetOne.");
    return;
  }

  const button = $("withdrawForm")?.querySelector(
    '[type="submit"]'
  );

  setLoading(button, true, "Request Withdrawal");

  try {
    const { error } = await db.rpc("request_withdrawal", {
      p_amount: amount,
      p_phone: phone,
      p_network: network
    });

    if (error) throw error;

    toast("Withdrawal request submitted. Awaiting processing.");

    $("withdrawForm")?.reset();

    await loadWallet();
    await loadWithdrawals();

  } catch (error) {
    toast("Withdrawal failed: " + error.message);

  } finally {
    setLoading(button, false, "Request Withdrawal");
  }
}

// ==========================================
// 14. WITHDRAWAL HISTORY
// ==========================================

async function loadWithdrawals() {
  const container = $("withdrawals");

  if (!container || !currentUser) return;

  try {
    const { data, error } = await db
      .from("withdrawals")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    container.innerHTML = (data || []).map(item => `
      <div class="withdrawal-item">

        <strong>${money(item.amount)}</strong>

        <p>${escapeHTML(item.network)}</p>

        <p>${escapeHTML(item.phone)}</p>

        <span>${escapeHTML(item.status)}</span>

      </div>
    `).join("") || "<p>No withdrawal requests.</p>";

  } catch (error) {
    console.error(error);
  }
}

// ==========================================
// 15. PAGE NAVIGATION
// ==========================================

function showPage(pageId) {
  document.querySelectorAll("[data-page-content]")
    .forEach(page => {
      page.style.display =
        page.id === pageId ? "block" : "none";
    });

  if (pageId === "marketplace") loadProducts();
  if (pageId === "myProducts") loadMyProducts();

  if (pageId === "rewards") {
    loadWallet();
    loadTransactions();
    loadWithdrawals();
  }
}

// ==========================================
// 16. CLICK HANDLERS
// ==========================================

document.addEventListener("click", async event => {

  const button = event.target.closest("[data-action]");

  if (button) {
    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === "like") {
      await likeProduct(id);
    }

    if (action === "download") {
      const product = productsCache.find(
        item => String(item.id) === String(id)
      );

      if (product) {
        await downloadProduct(
          product.file_path,
          product.file_name
        );
      }
    }
  }

  const navigation = event.target.closest("[data-page]");

  if (navigation) {
    showPage(navigation.dataset.page);
  }
});

// ==========================================
// 17. EVENT LISTENERS
// ==========================================

$("authForm")?.addEventListener("submit", handleAuth);

$("productForm")?.addEventListener("submit", publishProduct);

$("productImage")?.addEventListener(
  "change",
  handleFileSelection
);

$("withdrawForm")?.addEventListener(
  "submit",
  requestWithdrawal
);

$("logoutButton")?.addEventListener(
  "click",
  logoutUser
);

$("authToggle")?.addEventListener(
  "click",
  toggleAuthMode
);

// ==========================================
// 18. INITIALIZE APPLICATION
// ==========================================

async function initializeApp() {

  if ($("year")) {
    $("year").textContent = new Date().getFullYear();
  }

  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error(error);
    showAuth();
    return;
  }

  currentUser = data.session?.user || null;

  if (!currentUser) {
    showAuth();
    return;
  }

  showApp();

  await Promise.all([
    loadProducts(),
    loadMyProducts(),
    loadWallet(),
    loadTransactions(),
    loadWithdrawals()
  ]);
}

// ==========================================
// 19. AUTH STATE CHANGES
// ==========================================

db.auth.onAuthStateChange((event, session) => {

  currentUser = session?.user || null;

  if (currentUser) {
    showApp();

    setTimeout(() => {
      loadProducts();
      loadMyProducts();
      loadWallet();
    }, 0);

  } else {
    showAuth();
  }

});

// START APPLICATION
initializeApp();

// ==========================================
// END OF NARU STORES APP.JS
// ==========================================

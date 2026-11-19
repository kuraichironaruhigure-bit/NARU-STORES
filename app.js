
/* ==========================================
   NARU STORES - UPDATED APP.JS
   Wallet, Rewards, Products, Likes, Downloads
   ========================================== */

const SUPABASE_URL = "https://fsrosklmmmfprpczmdyr.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_KfHVYeZwnFSIy_fUpTN7zg_NajdmGNm";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const BUCKET = "product-files";
const REWARD_PER_LIKE = 1;

let currentUser = null;
let products = [];
let myProducts = [];
let rewards = [];

/* ==========================================
   HELPERS
   ========================================== */

const el = id => document.getElementById(id);

function showToast(message) {
  const toast = el("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.style.display = "block";

  setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

function money(value) {
  return "$" + Number(value || 0).toFixed(2);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

/* ==========================================
   AUTHENTICATION
   ========================================== */

async function checkLogin() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    showToast(error.message);
    return;
  }

  if (data.session) {
    currentUser = data.session.user;
    await startApp();
  } else {
    if (el("authScreen")) el("authScreen").style.display = "block";
    if (el("app")) el("app").style.display = "none";
  }
}

async function authenticate(event) {
  event.preventDefault();

  const email = el("email")?.value.trim();
  const password = el("password")?.value;

  if (!email || !password) {
    return showToast("Enter your email and password.");
  }

  const button = el("authSubmit");
  if (button) button.disabled = true;

  try {
    let result;

    if (window.authMode === "signup") {
      result = await db.auth.signUp({ email, password });
    } else {
      result = await db.auth.signInWithPassword({
        email,
        password
      });
    }

    if (result.error) throw result.error;

    if (result.data.user) {
      currentUser = result.data.user;

      if (result.data.session) {
        await startApp();
      } else {
        showToast("Check your email to confirm registration.");
      }
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

window.setAuthMode = function(mode) {
  window.authMode = mode;

  if (el("authTitle")) {
    el("authTitle").textContent =
      mode === "signup" ? "Create Account" : "Welcome Back";
  }

  if (el("authSubmit")) {
    el("authSubmit").textContent =
      mode === "signup" ? "Register" : "Login";
  }
};

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  location.reload();
}

/* ==========================================
   START APPLICATION
   ========================================== */

async function startApp() {
  if (!currentUser) return;

  if (el("authScreen")) el("authScreen").style.display = "none";
  if (el("app")) el("app").style.display = "block";

  if (el("userEmail")) {
    el("userEmail").textContent = currentUser.email;
  }

  if (el("year")) {
    el("year").textContent = new Date().getFullYear();
  }

  await Promise.all([
    loadStoreFiles(),
    loadMyProducts(),
    refreshWallet(),
    loadWithdrawalHistory()
  ]);
}

/* ==========================================
   PRODUCT UPLOADS
   ========================================== */

async function uploadStoreFile(file, description = "") {
  if (!currentUser) throw new Error("Please login first.");
  if (!file) throw new Error("Choose a file.");

  if (file.size > 50 * 1024 * 1024) {
    throw new Error("Maximum file size is 50 MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath =
    `${currentUser.id}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(filePath, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream"
    });

  if (uploadError) throw uploadError;

  const { data, error } = await db
    .from("products")
    .insert({
      user_id: currentUser.id,
      name: file.name,
      price: 0,
      description,
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
      likes_count: 0
    })
    .select()
    .single();

  if (error) {
    await db.storage.from(BUCKET).remove([filePath]);
    throw error;
  }

  return data;
}

async function publishProduct(event) {
  event.preventDefault();

  const file = el("productImage")?.files?.[0];
  const name = el("productName")?.value.trim();
  const price = Number(el("productPrice")?.value || 0);
  const description = el("productDescription")?.value.trim() || "";

  if (!name) return showToast("Enter a product name.");
  if (!file) return showToast("Choose a product file.");
  if (!Number.isFinite(price) || price < 0) {
    return showToast("Enter a valid price.");
  }

  try {
    const button = el("publishButton");
    if (button) button.disabled = true;

    await uploadStoreFile(file, description);

    showToast("Product published successfully!");

    el("productForm")?.reset();

    await Promise.all([
      loadStoreFiles(),
      loadMyProducts()
    ]);
  } catch (error) {
    showToast(error.message);
  } finally {
    if (el("publishButton")) {
      el("publishButton").disabled = false;
    }
  }
}

/* ==========================================
   LOAD MARKETPLACE
   ========================================== */

async function loadStoreFiles() {
  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showToast(error.message);
    return;
  }

  products = data || [];
  renderProducts();
}

function renderProducts() {
  const grid = el("productGrid");
  if (!grid) return;

  if (!products.length) {
    grid.innerHTML = "<p>No products available yet.</p>";
    return;
  }

  grid.innerHTML = products.map(product => `
    <article class="product-card">
      <h3>${escapeHTML(product.name)}</h3>

      <p>${escapeHTML(product.description || "")}</p>

      <p>${money(product.price)}</p>

      <p>${Number(product.likes_count || 0)} Likes</p>

      <button data-like="${escapeHTML(product.id)}">
        Like
      </button>

      <button data-download="${escapeHTML(product.id)}">
        Download
      </button>
    </article>
  `).join("");
}

/* ==========================================
   LIKE SYSTEM AND REWARDS
   ========================================== */

async function likeStoreFile(productId) {
  if (!currentUser) {
    return showToast("Please login first.");
  }

  try {
    const { error } = await db.rpc("like_product", {
      p_product_id: productId
    });

    if (error) throw error;

    showToast("Like recorded successfully!");

    await Promise.all([
      loadStoreFiles(),
      refreshWallet()
    ]);

  } catch (error) {
    showToast(error.message);
  }
}

/* ==========================================
   MY PRODUCTS
   ========================================== */

async function loadMyProducts() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    showToast(error.message);
    return;
  }

  myProducts = data || [];

  if (el("myProducts")) {
    el("myProducts").innerHTML = myProducts.map(product => `
      <div class="product-card">
        <h3>${escapeHTML(product.name)}</h3>
        <p>${escapeHTML(product.description || "")}</p>
        <p>${money(product.price)}</p>
      </div>
    `).join("") || "<p>You have not published any products.</p>";
  }
}

/* ==========================================
   DOWNLOAD SYSTEM
   ========================================== */

async function downloadStoreFile(productId) {
  const product = products.find(p => p.id === productId);

  if (!product) return showToast("Product not found.");

  try {
    const { data, error } = await db.storage
      .from(BUCKET)
      .download(product.file_path);

    if (error) throw error;

    const url = URL.createObjectURL(data);
    const link = document.createElement("a");

    link.href = url;
    link.download = product.file_name || product.name;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 3000);

  } catch (error) {
    showToast(error.message);
  }
}

/* ==========================================
   REWARDS AND WALLET
   ========================================== */

async function loadRewards() {
  if (!currentUser) return 0;

  const { data, error } = await db
    .from("like_rewards")
    .select("id,amount,status,product_id")
    .eq("user_id", currentUser.id);

  if (error) {
    showToast("Could not load rewards: " + error.message);
    return 0;
  }

  rewards = data || [];

  const pending = rewards
    .filter(r => r.status === "pending")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const approved = rewards
    .filter(r => r.status === "approved")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const pendingElement = el("pendingRewards");
  const approvedElement = el("approvedRewards");

  if (pendingElement) pendingElement.textContent = money(pending);
  if (approvedElement) approvedElement.textContent = money(approved);

  const rewardsContainer = el("rewardsList");

  if (rewardsContainer) {
    rewardsContainer.innerHTML = rewards.map(r => `
      <div class="reward-item">
        <strong>${money(r.amount)}</strong>
        <span>${escapeHTML(r.status)}</span>
        <small>Product: ${escapeHTML(r.product_id)}</small>
      </div>
    `).join("") || "<p>No rewards yet.</p>";
  }

  return approved;
}

async function refreshWallet() {
  if (!currentUser) return;

  try {
    const approved = await loadRewards();

    const { data: wallet, error } = await db
      .from("wallets")
      .select("balance")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    // The database wallet remains authoritative for withdrawals.
    // Approved rewards are shown separately until credited server-side.
    const databaseBalance = Number(wallet?.balance || 0);

    if (el("balance")) {
      el("balance").textContent = money(databaseBalance);
    }

    if (el("approvedRewards")) {
      el("approvedRewards").textContent = money(approved);
    }

  } catch (error) {
    showToast("Wallet error: " + error.message);
  }
}

/* ==========================================
   AIRTIME WITHDRAWALS
   ========================================== */

async function withdrawStoreMoney(event) {
  event.preventDefault();

  if (!currentUser) return;

  const amount = Number(el("withdrawAmount")?.value);
  const phone = el("phone")?.value.trim();
  const network = el("network")?.value;

  if (!Number.isFinite(amount) || amount <= 0) {
    return showToast("Enter a valid withdrawal amount.");
  }

  if (!phone) return showToast("Enter your phone number.");

  if (!["Econet", "NetOne"].includes(network)) {
    return showToast("Choose Econet or NetOne.");
  }

  try {
    const { data, error } = await db.rpc("request_withdrawal", {
      p_amount: amount,
      p_phone: phone,
      p_network: network
    });

    if (error) throw error;

    showToast("Withdrawal request submitted!");

    el("withdrawForm")?.reset();

    await Promise.all([
      refreshWallet(),
      loadWithdrawalHistory()
    ]);

  } catch (error) {
    showToast("Withdrawal failed: " + error.message);
  }
}

/* ==========================================
   WITHDRAWAL HISTORY
   ========================================== */

async function loadWithdrawalHistory() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("withdrawals")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    showToast(error.message);
    return;
  }

  if (el("withdrawals")) {
    el("withdrawals").innerHTML = (data || []).map(w => `
      <div class="withdrawal-item">
        <strong>${money(w.amount)}</strong>
        <p>${escapeHTML(w.network || "")}</p>
        <p>${escapeHTML(w.phone || "")}</p>
        <span>${escapeHTML(w.status || "pending")}</span>
      </div>
    `).join("") || "<p>No withdrawals yet.</p>";
  }
}

/* ==========================================
   NAVIGATION
   ========================================== */

function showPage(page) {
  document.querySelectorAll("[data-page]").forEach(section => {
    section.style.display =
      section.dataset.page === page ? "block" : "none";
  });
}

/* ==========================================
   EVENT LISTENERS
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {
  el("authForm")?.addEventListener("submit", authenticate);

  el("productForm")?.addEventListener("submit", publishProduct);

  el("withdrawForm")?.addEventListener(
    "submit",
    withdrawStoreMoney
  );

  el("logoutBtn")?.addEventListener("click", logout);
  el("logoutButton")?.addEventListener("click", logout);

  el("refreshBtn")?.addEventListener("click", async () => {
    await startApp();
    showToast("Store refreshed.");
  });

  document.addEventListener("click", event => {
    const likeButton = event.target.closest("[data-like]");
    const downloadButton = event.target.closest("[data-download]");

    if (likeButton) {
      likeStoreFile(likeButton.dataset.like);
    }

    if (downloadButton) {
      downloadStoreFile(downloadButton.dataset.download);
    }

    const nav = event.target.closest("[data-nav]");
    if (nav) showPage(nav.dataset.nav);
  });

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) {
      currentUser = session.user;
      startApp();
    }
  });

  checkLogin();
});

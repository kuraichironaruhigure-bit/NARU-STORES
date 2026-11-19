// ==========================================
// NARU STORES - FIXED COMPLETE APP.JS
// Login, signup, uploads, likes, rewards,
// downloads, wallet and manual airtime
// ==========================================

const SUPABASE_URL = "https://fsrosklmmmfprpczmdyr.supabase.co";
const SUPABASE_KEY = "sb_publishable_KfHVYeZwnFSIy_fUpTN7zg_NajdmGNm";
const BUCKET = "product-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

if (!window.supabase || !window.supabase.createClient) {
  alert("NARU STORES could not load Supabase. Check your internet connection and refresh.");
  throw new Error("Supabase library failed to load.");
}

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

let currentUser = null;
let isAdmin = false;

const $ = id => document.getElementById(id);

// ==========================================
// HELPERS
// ==========================================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function money(value) {
  return "$" + Number(value || 0).toFixed(2);
}

function message(id, value, error = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = value;
  element.style.color = error ? "#c43c50" : "#23864a";
}

function toast(value) {
  const element = $("toast");
  if (!element) return;

  element.textContent = value;
  element.classList.add("show");

  setTimeout(() => {
    element.classList.remove("show");
  }, 3500);
}

function setLoading(button, loading, text = "Please wait...") {
  if (!button) return;

  if (loading) {
    button.dataset.oldText = button.textContent;
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.oldText || "Submit";
  }
}

function showPage(page) {
  if (page === "admin" && !isAdmin) return;

  document.querySelectorAll(".navigation [data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle("hidden", section.id !== `page-${page}`);
  });

  if (page === "home") loadProducts();
  if (page === "mine") loadMyProducts();

  if (page === "wallet") {
    loadWallet();
    loadMyRewards();
    loadWithdrawals();
    loadTransactions();
  }

  if (page === "admin" && isAdmin) {
    loadAdminRewards();
    loadAdminWithdrawals();
  }
}

// ==========================================
// AUTHENTICATION
// ==========================================

async function authSubmit(event) {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;
  const mode =
    document.querySelector("[data-tab].active")?.dataset.tab || "login";

  const button = $("authSubmit");

  if (!email || !password) {
    message("authMessage", "Enter your email and password.", true);
    return;
  }

  setLoading(button, true, "Please wait...");
  message("authMessage", "");

  try {
    let result;

    if (mode === "signup") {
      result = await db.auth.signUp({
        email,
        password
      });

      if (result.error) throw result.error;

      if (!result.data.session) {
        message(
          "authMessage",
          "Account created. Check your email and confirm your account before logging in."
        );
        return;
      }
    } else {
      result = await db.auth.signInWithPassword({
        email,
        password
      });

      if (result.error) throw result.error;
    }

    if (!result.data.user) {
      throw new Error("Authentication completed, but no user was returned.");
    }

    await startApp(result.data.user);

  } catch (error) {
    console.error("Authentication error:", error);
    message(
      "authMessage",
      error.message || "Login failed. Please try again.",
      true
    );
  } finally {
    setLoading(button, false);
  }
}

async function logout() {
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;
    location.reload();
  } catch (error) {
    toast("Logout failed: " + error.message);
  }
}

async function startApp(user) {
  if (!user) return;

  currentUser = user;
  isAdmin = user.app_metadata?.role === "admin";

  $("authScreen")?.classList.add("hidden");
  $("app")?.classList.remove("hidden");
  $("logoutBtn")?.classList.remove("hidden");

  if ($("userEmail")) {
    $("userEmail").textContent = user.email || "";
  }

  if ($("year")) {
    $("year").textContent = new Date().getFullYear();
  }

  if (isAdmin) {
    $("adminNav")?.classList.remove("hidden");
  }

  await loadProducts();
  await loadMyProducts();
  await loadWallet();
  await loadMyRewards();
  await loadWithdrawals();
  await loadTransactions();
}

// ==========================================
// STORAGE
// ==========================================

async function uploadFile(file) {
  if (!file) throw new Error("Choose a file.");

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File is larger than 50 MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const path = `${currentUser.id}/${Date.now()}_${safeName}`;

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: false,
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream"
    });

  if (error) throw error;

  return path;
}

async function signedFileUrl(path) {
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, 600);

  if (error) throw error;

  return data.signedUrl;
}

function filePreview(url, type, name) {
  if (type?.startsWith("image/")) {
    return `
      <img
        class="product-media"
        src="${escapeHTML(url)}"
        alt="${escapeHTML(name)}"
        loading="lazy"
      >
    `;
  }

  if (type?.startsWith("video/")) {
    return `
      <video
        class="product-media"
        src="${escapeHTML(url)}"
        controls
        playsinline
        preload="metadata"
      ></video>
    `;
  }

  return `
    <div class="file-preview">
      <span>📁</span>
      <small>${escapeHTML(name || "File")}</small>
    </div>
  `;
}

// ==========================================
// PRODUCTS
// ==========================================

async function productCard(product) {
  let preview = `
    <div class="file-preview">
      <span>📁</span>
      <small>${escapeHTML(product.file_name || "File")}</small>
    </div>
  `;

  if (product.file_path) {
    try {
      const url = await signedFileUrl(product.file_path);
      preview = filePreview(url, product.mime_type, product.file_name);
    } catch (error) {
      console.warn("Preview error:", error.message);
    }
  } else if (product.image_url) {
    preview = `
      <img
        class="product-media"
        src="${escapeHTML(product.image_url)}"
        alt=""
      >
    `;
  }

  return `
    <article class="product-card">
      <div class="product-image">
        ${preview}
      </div>

      <div class="product-info">
        <h3>${escapeHTML(product.name || product.file_name || "Untitled")}</h3>

        <p>${escapeHTML(product.description || "")}</p>

        <strong>${escapeHTML(product.price || "Free")}</strong>

        <div class="product-actions">
          <button type="button" data-like="${escapeHTML(product.id)}">
            ❤️ Like (${Number(product.likes_count || 0)})
          </button>

          <button type="button" data-download="${escapeHTML(product.id)}">
            ⬇ Download
          </button>
        </div>
      </div>
    </article>
  `;
}

async function renderProducts(containerId, query) {
  const container = $(containerId);
  if (!container) return;

  container.textContent = "Loading...";

  const { data, error } = await query;

  if (error) {
    container.textContent = error.message;
    return;
  }

  if (!data?.length) {
    container.textContent = "No uploads yet.";
    return;
  }

  const cards = await Promise.all(data.map(productCard));
  container.innerHTML = cards.join("");
}

async function loadProducts() {
  await renderProducts(
    "products",
    db.from("products")
      .select("*")
      .order("created_at", { ascending: false })
  );
}

async function loadMyProducts() {
  if (!currentUser) return;

  await renderProducts(
    "myProducts",
    db.from("products")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
  );
}

// ==========================================
// UPLOAD
// ==========================================

async function publishProduct(event) {
  event.preventDefault();

  const file = $("productImage").files[0];
  const name = $("productName").value.trim();
  const price = $("productPrice").value.trim() || "Free";
  const description = $("productDescription").value.trim();

  const button =
    event.submitter ||
    event.target.querySelector('button[type="submit"]');

  if (!file || !name) {
    message("uploadMessage", "Enter a name and select a file.", true);
    return;
  }

  setLoading(button, true, "Uploading...");

  let path = null;

  try {
    path = await uploadFile(file);

    const { error } = await db.from("products").insert({
      user_id: currentUser.id,
      name,
      price,
      description,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
      image_url: null,
      likes_count: 0
    });

    if (error) throw error;

    event.target.reset();

    message("uploadMessage", "Your upload has been published.");
    toast("Upload published!");

    await loadProducts();
    await loadMyProducts();
    showPage("home");

  } catch (error) {
    if (path) {
      await db.storage.from(BUCKET).remove([path]);
    }

    message("uploadMessage", error.message, true);

  } finally {
    setLoading(button, false);
  }
}

// ==========================================
// LIKES
// ==========================================

async function likeProduct(productId) {
  const { error } = await db.rpc("like_product", {
    p_product_id: productId
  });

  if (error) {
    toast(error.message);
    return;
  }

  toast("Like recorded. A pending reward was created for the uploader.");

  await loadProducts();
  await loadMyProducts();
  await loadMyRewards();
}

// ==========================================
// DOWNLOADS
// ==========================================

async function downloadProduct(productId) {
  const { data, error } = await db.from("products")
    .select("file_path,file_name")
    .eq("id", productId)
    .single();

  if (error) {
    toast(error.message);
    return;
  }

  if (!data.file_path) {
    toast("No downloadable file was found.");
    return;
  }

  try {
    const url = await signedFileUrl(data.file_path);

    const link = document.createElement("a");
    link.href = url;
    link.download = data.file_name || "naru-file";
    link.target = "_blank";

    document.body.appendChild(link);
    link.click();
    link.remove();

  } catch (error) {
    toast("Download failed: " + error.message);
  }
}

// ==========================================
// WALLET
// ==========================================

async function loadWallet() {
  if (!currentUser) return;

  const { data, error } = await db.from("wallets")
    .select("balance")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Wallet error:", error);
    return;
  }

  if ($("balance")) {
    $("balance").textContent = money(data?.balance || 0);
  }
}

async function loadMyRewards() {
  if (!currentUser) return;

  const container = $("myRewards");
  if (!container) return;

  const { data, error } = await db.from("like_rewards")
    .select("id,product_id,amount,status,created_at")
    .eq("creator_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    container.textContent = error.message;
    return;
  }

  const rows = data || [];

  const pending = rows
    .filter(r => r.status === "pending")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const approved = rows
    .filter(r => r.status === "approved")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  container.innerHTML = `
    <p>Pending rewards: <strong>${money(pending)}</strong></p>
    <p>Approved rewards: <strong>${money(approved)}</strong></p>

    ${rows.map(r => `
      <div class="history-item">
        <strong>${money(r.amount)}</strong>
        <span> · ${escapeHTML(r.status)}</span>
        <small>Product: ${escapeHTML(r.product_id)}</small>
      </div>
    `).join("") || "<p>No rewards yet.</p>"}
  `;
}

async function loadTransactions() {
  if (!currentUser) return;

  const container = $("transactions");
  if (!container) return;

  const { data, error } = await db.from("wallet_transactions")
    .select("amount,type,description,created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    container.textContent = error.message;
    return;
  }

  container.innerHTML = (data || []).map(t => `
    <div class="history-item">
      <strong>${money(t.amount)}</strong>
      <span> · ${escapeHTML(t.type)}</span>
      <p>${escapeHTML(t.description || "")}</p>
      <small>${new Date(t.created_at).toLocaleString()}</small>
    </div>
  `).join("") || "<p>No transactions yet.</p>";
}

// ==========================================
// AIRTIME REQUESTS
// NO ADMIN APPROVAL REQUIRED FOR REQUESTS
// ==========================================

async function requestAirtime(event) {
  event.preventDefault();

  const network = $("network").value;
  const phone = $("phone").value.trim();
  const amount = Number($("withdrawAmount").value);

  const button =
    event.submitter ||
    event.target.querySelector('button[type="submit"]');

  if (!["Econet", "NetOne"].includes(network)) {
    message("withdrawMessage", "Choose Econet or NetOne.", true);
    return;
  }

  if (!/^[0-9+ ]{9,16}$/.test(phone)) {
    message("withdrawMessage", "Enter a valid phone number.", true);
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    message("withdrawMessage", "Enter a valid amount.", true);
    return;
  }

  setLoading(button, true, "Submitting...");

  try {
    const { error } = await db.rpc("request_withdrawal", {
      p_amount: amount,
      p_phone: phone,
      p_network: network
    });

    if (error) throw error;

    event.target.reset();

    message(
      "withdrawMessage",
      "Request submitted. Your balance has been reserved. Airtime will be sent manually."
    );

    toast("Airtime request recorded.");

    await loadWallet();
    await loadWithdrawals();
    await loadTransactions();

  } catch (error) {
    message("withdrawMessage", error.message, true);

  } finally {
    setLoading(button, false);
  }
}

async function loadWithdrawals() {
  if (!currentUser) return;

  const container = $("withdrawals");
  if (!container) return;

  let query = db.from("withdrawals").select("*");

  if (!isAdmin) {
    query = query.eq("user_id", currentUser.id);
  }

  const { data, error } = await query.order("created_at", {
    ascending: false
  });

  if (error) {
    container.textContent = error.message;
    return;
  }

  container.innerHTML = (data || []).map(w => `
    <div class="history-item">
      <strong>${money(w.amount)}</strong>
      <p>${escapeHTML(w.network)} · ${escapeHTML(w.phone_number)}</p>
      <span>Status: ${escapeHTML(w.status)}</span>
      <small>${new Date(w.created_at).toLocaleString()}</small>
    </div>
  `).join("") || "<p>No airtime requests.</p>";
}

// ==========================================
// ADMIN: REWARD REVIEW
// ==========================================

async function loadAdminRewards() {
  if (!isAdmin) return;

  const container = $("adminRewards");
  if (!container) return;

  const { data, error } = await db.from("like_rewards")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    container.textContent = error.message;
    return;
  }

  container.innerHTML = (data || []).map(r => `
    <div class="history-item">
      <strong>Reward #${escapeHTML(r.id)} · ${money(r.amount)}</strong>
      <p>Uploader: ${escapeHTML(r.creator_id)}</p>
      <p>Product: ${escapeHTML(r.product_id)}</p>

      <button data-review="${escapeHTML(r.id)}" data-action="approve">
        Approve
      </button>

      <button data-review="${escapeHTML(r.id)}" data-action="reject">
        Reject
      </button>
    </div>
  `).join("") || "<p>No pending rewards.</p>";
}

async function reviewReward(id, action) {
  const { error } = await db.rpc("review_like_reward", {
    p_reward_id: Number(id),
    p_action: action
  });

  if (error) {
    toast(error.message);
    return;
  }

  toast("Reward " + action + "d.");

  await loadAdminRewards();
  await loadWallet();
  await loadMyRewards();
}

// ==========================================
// ADMIN: MANUAL AIRTIME
// ==========================================

async function loadAdminWithdrawals() {
  if (!isAdmin) return;

  const container = $("adminWithdrawals");
  if (!container) return;

  const { data, error } = await db.from("withdrawals")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    container.textContent = error.message;
    return;
  }

  container.innerHTML = (data || []).map(w => `
    <div class="history-item">
      <strong>Request #${escapeHTML(w.id)} · ${money(w.amount)}</strong>
      <p>${escapeHTML(w.network)}: ${escapeHTML(w.phone_number)}</p>
      <p>User: ${escapeHTML(w.user_id)}</p>

      <button data-paid="${escapeHTML(w.id)}">
        Mark Paid
      </button>

      <button data-reject="${escapeHTML(w.id)}">
        Reject and Refund
      </button>
    </div>
  `).join("") || "<p>No pending airtime requests.</p>";
}

async function markPaid(id) {
  if (!confirm("Have you already sent airtime to this number?")) return;

  const { error } = await db.rpc("mark_withdrawal_paid", {
    p_withdrawal_id: String(id)
  });

  if (error) {
    toast(error.message);
    return;
  }

  toast("Withdrawal marked as paid.");

  await loadAdminWithdrawals();
  await loadWithdrawals();
}

async function rejectWithdrawal(id) {
  if (!confirm("Reject this request and refund the wallet?")) return;

  const { error } = await db.rpc("reject_withdrawal", {
    p_withdrawal_id: String(id)
  });

  if (error) {
    toast(error.message);
    return;
  }

  toast("Request rejected and refunded.");

  await loadAdminWithdrawals();
  await loadWithdrawals();
  await loadWallet();
  await loadTransactions();
}

// ==========================================
// EVENTS
// ==========================================

document.addEventListener("click", async event => {
  const tab = event.target.closest("[data-tab]");

  if (tab) {
    document.querySelectorAll("[data-tab]").forEach(t => {
      t.classList.toggle("active", t === tab);
    });

    if ($("authSubmit")) {
      $("authSubmit").textContent =
        tab.dataset.tab === "signup" ? "Create account" : "Login";
    }

    message("authMessage", "");
    return;
  }

  const page = event.target.closest("[data-page]");

  if (page) {
    showPage(page.dataset.page);
    return;
  }

  const like = event.target.closest("[data-like]");
  if (like) {
    await likeProduct(like.dataset.like);
    return;
  }

  const download = event.target.closest("[data-download]");
  if (download) {
    await downloadProduct(download.dataset.download);
    return;
  }

  const review = event.target.closest("[data-review]");
  if (review && isAdmin) {
    await reviewReward(review.dataset.review, review.dataset.action);
    return;
  }

  const paid = event.target.closest("[data-paid]");
  if (paid && isAdmin) {
    await markPaid(paid.dataset.paid);
    return;
  }

  const reject = event.target.closest("[data-reject]");
  if (reject && isAdmin) {
    await rejectWithdrawal(reject.dataset.reject);
  }
});

// ==========================================
// STARTUP
// ==========================================

function connectEvents() {
  $("authForm")?.addEventListener("submit", authSubmit);
  $("logoutBtn")?.addEventListener("click", logout);
  $("uploadForm")?.addEventListener("submit", publishProduct);
  $("withdrawForm")?.addEventListener("submit", requestAirtime);

  $("refreshProducts")?.addEventListener("click", loadProducts);
  $("refreshMine")?.addEventListener("click", loadMyProducts);
}

async function initialise() {
  connectEvents();

  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      await startApp(data.session.user);
    } else {
      $("authScreen")?.classList.remove("hidden");
      $("app")?.classList.add("hidden");
    }

  } catch (error) {
    console.error("Startup error:", error);

    message(
      "authMessage",
      "Could not start NARU STORES: " + error.message,
      true
    );
  }
}

db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    isAdmin = false;
    location.reload();
  }
});

initialise();

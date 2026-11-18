
// ======================================
// NARU STORES - SUPABASE CONFIGURATION
// ======================================

const SUPABASE_URL = "https://fsrosklmmmfprpczmdyr.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable_KfHVYeZwnFSIy_fUpTN7zg_NajdmGNm";

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_ANON_KEY.includes("PASTE_");

const db = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ======================================
// APP VARIABLES
// ======================================

let mode = "login";
let currentUser = null;
let likedIds = new Set();

const $ = id => document.getElementById(id);

const money = n => "$" + Number(n || 0).toFixed(2);

// ======================================
// MESSAGES AND SCREEN DISPLAY
// ======================================

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.add("show");

  setTimeout(() => {
    $("toast").classList.remove("show");
  }, 2800);
}

function message(id, msg) {
  $(id).textContent = msg;
}

function showAuth() {
  $("authScreen").classList.remove("hidden");
  $("app").classList.add("hidden");
}

function showApp(user) {
  currentUser = user;

  $("authScreen").classList.add("hidden");
  $("app").classList.remove("hidden");

  $("userEmail").textContent = user.email || "";
  $("year").textContent = new Date().getFullYear();

  loadHome();
}

function configNotice() {
  message(
    "authMessage",
    "Setup needed: check your Supabase URL, publishable key and setup.sql."
  );
}

// ======================================
// SIGN UP AND LOGIN
// ======================================

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    mode = button.dataset.tab;

    document.querySelectorAll(".tab").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    $("authSubmit").textContent =
      mode === "login" ? "Log in" : "Create account";

    message("authMessage", "");
  });
});

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!db) return configNotice();

  const email = $("email").value.trim();
  const password = $("password").value;

  message("authMessage", "Please wait...");

  const result =
    mode === "login"
      ? await db.auth.signInWithPassword({ email, password })
      : await db.auth.signUp({ email, password });

  if (result.error) {
    return message("authMessage", result.error.message);
  }

  if (mode === "signup" && !result.data.session) {
    return message(
      "authMessage",
      "Account created. Check your email to confirm, then log in."
    );
  }

  showApp(result.data.user);
});

// ======================================
// LOG OUT
// ======================================

$("logoutBtn").onclick = async () => {
  if (db) await db.auth.signOut();

  currentUser = null;
  showAuth();
};

// ======================================
// NAVIGATION
// ======================================

document.querySelectorAll(".nav-btn").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".nav-btn").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    document.querySelectorAll(".page").forEach(page => {
      page.classList.add("hidden");
    });

    $("page-" + button.dataset.page).classList.remove("hidden");

    if (button.dataset.page === "mine") loadMine();
    if (button.dataset.page === "wallet") loadWallet();
  };
});

$("refreshBtn").onclick = loadHome;

// ======================================
// HTML SECURITY
// ======================================

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

// ======================================
// PRODUCT CARDS
// ======================================

function productCard(product) {
  const liked = likedIds.has(product.id);

  const image =
    product.image_url ||
    "https://placehold.co/600x400?text=Naru+Stores";

  return `
    <article class="product-card">

      <img
        src="${escapeHtml(image)}"
        alt="${escapeHtml(product.name)}"
        loading="lazy"
      >

      <div class="product-info">

        <h3>${escapeHtml(product.name)}</h3>

        <div class="price">
          ${escapeHtml(product.price)}
        </div>

        <div class="description">
          ${escapeHtml(product.description)}
        </div>

        <div class="seller">
          Shared by ${escapeHtml(
            product.seller_email || "Naru Stores seller"
          )}
        </div>

        <div class="card-bottom">

          <button
            class="like-btn ${liked ? "liked" : ""}"
            data-like="${product.id}"
          >
            ♥ ${product.like_count || 0}
            ${liked ? "Liked" : "Like"}
          </button>

          <button
            class="share-btn"
            data-share="${product.id}"
          >
            Share ↗
          </button>

        </div>
      </div>
    </article>
  `;
}

// ======================================
// LOAD LIKES
// ======================================

async function getLiked() {
  const result = await db
    .from("product_likes")
    .select("product_id")
    .eq("user_id", currentUser.id);

  likedIds = new Set(
    (result.data || []).map(item => item.product_id)
  );
}

// ======================================
// LOAD STORE PRODUCTS
// ======================================

async function loadHome() {
  if (!db || !currentUser) return;

  await getLiked();

  const result = await db
    .from("products")
    .select(
      "id,name,price,description,image_url,like_count,user_id,created_at"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (result.error) return toast(result.error.message);

  const ids = [
    ...new Set((result.data || []).map(product => product.user_id))
  ];

  let profiles = {};

  if (ids.length) {
    const profileResult = await db
      .from("profiles")
      .select("id,email")
      .in("id", ids);

    (profileResult.data || []).forEach(profile => {
      profiles[profile.id] = profile.email;
    });
  }

  const products = (result.data || []).map(product => ({
    ...product,
    seller_email: profiles[product.user_id] || "Community seller"
  }));

  $("productGrid").innerHTML = products.map(productCard).join("");

  $("emptyProducts").classList.toggle(
    "hidden",
    products.length > 0
  );

  bindCards();
}

// ======================================
// MY PRODUCTS
// ======================================

async function loadMine() {
  if (!db || !currentUser) return;

  await getLiked();

  const result = await db
    .from("products")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (result.error) return toast(result.error.message);

  $("myProducts").innerHTML =
    (result.data || []).map(productCard).join("");

  $("emptyMine").classList.toggle(
    "hidden",
    (result.data || []).length > 0
  );

  bindCards();
}

// ======================================
// PRODUCT BUTTONS
// ======================================

function bindCards() {
  document.querySelectorAll("[data-like]").forEach(button => {
    button.onclick = () => likeProduct(button.dataset.like);
  });

  document.querySelectorAll("[data-share]").forEach(button => {
    button.onclick = () => {
      const url =
        location.origin +
        location.pathname +
        "?product=" +
        encodeURIComponent(button.dataset.share);

      if (navigator.share) {
        navigator.share({
          title: "Naru Stores product",
          url
        }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url)
          .then(() => toast("Product link copied"))
          .catch(() => toast("Unable to copy link"));
      } else {
        toast("Sharing is not supported on this browser.");
      }
    };
  });
}

// ======================================
// LIKE PRODUCT AND REWARD
// ======================================

async function likeProduct(id) {
  if (!db || !currentUser) return;

  if (likedIds.has(id)) {
    return toast("You have already liked this product.");
  }

  const result = await db.rpc("like_product", {
    p_product_id: id
  });

  if (result.error) return toast(result.error.message);

  likedIds.add(id);

  toast("Like recorded. Reward credited to the product owner.");

  await loadHome();
}

// ======================================
// UPLOAD PRODUCT
// ======================================

$("productForm").onsubmit = async event => {
  event.preventDefault();

  if (!db || !currentUser) return;

  const file = $("productImage").files[0];

  if (!file) {
    return message("uploadMessage", "Choose a product photo.");
  }

  if (file.size > 5 * 1024 * 1024) {
    return message(
      "uploadMessage",
      "Please use an image smaller than 5 MB."
    );
  }

  message("uploadMessage", "Uploading image...");

  const ext = (file.name.split(".").pop() || "jpg")
    .replace(/[^a-z0-9]/gi, "");

  const path =
    currentUser.id +
    "/" +
    crypto.randomUUID() +
    "." +
    ext;

  const upload = await db.storage
    .from("product-images")
    .upload(path, file, {
      upsert: false,
      contentType: file.type
    });

  if (upload.error) {
    return message("uploadMessage", upload.error.message);
  }

  const imageUrl = db.storage
    .from("product-images")
    .getPublicUrl(path).data.publicUrl;

  const result = await db
    .from("products")
    .insert({
      user_id: currentUser.id,
      name: $("productName").value.trim(),
      price: $("productPrice").value.trim(),
      description: $("productDescription").value.trim(),
      image_url: imageUrl
    });

  if (result.error) {
    return message("uploadMessage", result.error.message);
  }

  $("productForm").reset();

  message("uploadMessage", "Product published successfully.");

  toast("Your product is now listed.");

  await loadHome();

  document.querySelector('[data-page="home"]').click();
};

// ======================================
// WALLET
// ======================================

async function loadWallet() {
  if (!db || !currentUser) return;

  const wallet = await db
    .from("wallets")
    .select("balance")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (wallet.error) return toast(wallet.error.message);

  $("balance").textContent = money(wallet.data?.balance || 0);

  const result = await db
    .from("withdrawal_requests")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (result.error) return toast(result.error.message);

  $("withdrawals").innerHTML =
    (result.data || []).map(item => `
      <div class="request">

        <div>
          <b>
            ${escapeHtml(item.network)}
            ·
            ${escapeHtml(item.phone_number)}
          </b>

          <div class="muted">
            ${new Date(item.created_at).toLocaleString()}
          </div>
        </div>

        <div>
          <b>${money(item.amount)}</b>

          <div class="status">
            ${escapeHtml(item.status)}
          </div>
        </div>

      </div>
    `).join("") ||
    '<p class="muted tiny">No withdrawal requests yet.</p>';
}

// ======================================
// AIRTIME WITHDRAWAL REQUEST
// ======================================

$("withdrawForm").onsubmit = async event => {
  event.preventDefault();

  if (!db || !currentUser) return;

  const amount = Number($("withdrawAmount").value);

  if (!Number.isFinite(amount) || amount < 1) {
    return message(
      "withdrawMessage",
      "Minimum request is $1.00."
    );
  }

  message("withdrawMessage", "Submitting request...");

  const result = await db.rpc("request_airtime_withdrawal", {
    p_network: $("network").value,
    p_phone_number: $("phone").value.trim(),
    p_amount: amount
  });

  if (result.error) {
    return message("withdrawMessage", result.error.message);
  }

  message(
    "withdrawMessage",
    "Request submitted. It will remain pending until airtime is sent and confirmed."
  );

  $("phone").value = "";

  await loadWallet();
};

// ======================================
// START APPLICATION
// ======================================

async function init() {
  if (!configured || !db) {
    showAuth();
    configNotice();
    return;
  }

  const {
    data: { session }
  } = await db.auth.getSession();

  if (session) {
    showApp(session.user);
  } else {
    showAuth();
  }

  db.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showApp(session.user);
    } else {
      currentUser = null;
      showAuth();
    }
  });
}

init();

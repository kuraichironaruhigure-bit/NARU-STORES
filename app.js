
// ==========================================
// NARU STORES - FILES, LIKES & REWARDS
// ==========================================

// UPLOAD ANY FILE TYPE
async function uploadStoreFile(file, description = "") {
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError || !user) throw new Error("Please sign in first");
  if (!file) throw new Error("Choose a file first");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("product-files")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("products")
    .insert({
      user_id: user.id,
      file_name: file.name,
      file_path: path,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size,
      description
    })
    .select()
    .single();

  if (error) {
    await supabase.storage.from("product-files").remove([path]);
    throw error;
  }

  return data;
}

// LOAD STORE FILES
async function loadStoreFiles() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// LIKE A FILE - OWNER RECEIVES $1
async function likeStoreFile(productId) {
  const { data, error } = await supabase.rpc(
    "like_product",
    { p_product_id: productId }
  );

  if (error) throw error;

  return data;
}

// GET WALLET BALANCE
async function getStoreWallet() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("Please sign in");

  const { data, error } = await supabase
    .from("wallets")
    .select("balance")
    .eq("user_id", user.id)
    .single();

  if (error) throw error;

  return Number(data.balance);
}

// REQUEST WITHDRAWAL
async function withdrawStoreMoney(amount, phone, network) {
  const { data, error } = await supabase.rpc(
    "request_withdrawal",
    {
      p_amount: Number(amount),
      p_phone: phone,
      p_network: network
    }
  );

  if (error) throw error;

  return data;
}

// FILE DOWNLOAD
async function downloadStoreFile(filePath) {
  const { data, error } = await supabase.storage
    .from("product-files")
    .createSignedUrl(filePath, 60);

  if (error) throw error;

  window.open(data.signedUrl, "_blank");
}

// LOAD WITHDRAWAL HISTORY
async function loadWithdrawalHistory() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("Please sign in");

  const { data, error } = await supabase
    .from("withdrawals")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data;
}

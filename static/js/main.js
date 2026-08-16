const DELIVERY_PRICE = 600;

const I18N = window.I18N || {};
const BUY_LABEL = I18N["js.buy_label"] || "Confirm your love for this bag 💕";
const SENDING_LABEL = I18N["js.sending"] || "Sending your beautiful order 💌";

let wilayas = [];
let currentBag = null;
let currentVariant = 0;
let deliveryType = "home";
const bagsCache = {};

const modal = document.getElementById("checkoutModal");
const form = document.getElementById("checkoutForm");
const wilayaSelect = document.getElementById("wilaya");
const citySelect = document.getElementById("city");
const qtyInput = document.getElementById("qty");
const formError = document.getElementById("formError");
const successBox = document.getElementById("successBox");
const variantThumbs = document.getElementById("variantThumbs");
const chosenColor = document.getElementById("chosenColor");
const deliveryHomePrice = document.getElementById("deliveryHomePrice");
const deliveryOfficePrice = document.getElementById("deliveryOfficePrice");

function formatDA(n) {
  return n.toLocaleString("en-US") + " DZD";
}

function showError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
}

function hideError() {
  formError.hidden = true;
}

async function loadWilayas() {
  try {
    const res = await fetch("/api/wilayas");
    wilayas = await res.json();
    wilayaSelect.innerHTML = `<option value="">${I18N["js.select_wilaya"] || "— Select wilaya —"}</option>`;
    wilayas.forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w.name;
      opt.textContent = `${w.code} - ${w.name}`;
      wilayaSelect.appendChild(opt);
    });
  } catch (e) {
    showError(I18N["js.wilayas_error"] || "Couldn't load wilayas. Please reload.");
  }
}

function updateCities() {
  const w = wilayas.find((x) => x.name === wilayaSelect.value);
  citySelect.innerHTML = "";
  if (!w) {
    citySelect.innerHTML = `<option value="">${I18N["js.city_first"] || "— Select a wilaya first —"}</option>`;
    citySelect.disabled = true;
    return;
  }
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = (I18N["js.select_city"] || "— Select municipality ({wilaya}) —").replace("{wilaya}", w.name);
  citySelect.appendChild(placeholder);
  w.cities.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    citySelect.appendChild(opt);
  });
  citySelect.disabled = false;
}

async function getBag(id) {
  if (bagsCache[id]) return bagsCache[id];
  const res = await fetch("/api/bags");
  const bags = await res.json();
  bags.forEach((b) => (bagsCache[b.id] = b));
  return bagsCache[id];
}

function renderVariantThumbs() {
  variantThumbs.innerHTML = "";
  currentBag.variants.forEach((v, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vthumb" + (i === currentVariant ? " active" : "");
    btn.dataset.variant = i;
    btn.title = v.color;
    const img = document.createElement("img");
    img.src = v.image;
    img.alt = v.color;
    img.onerror = function () {
      this.onerror = null;
      this.src = "/static/images/bags/placeholder.svg";
    };
    btn.appendChild(img);
    btn.addEventListener("click", () => selectVariant(i));
    variantThumbs.appendChild(btn);
  });
}

function selectVariant(i) {
  currentVariant = i;
  const v = currentBag.variants[i];
  chosenColor.textContent = v.color;
  variantThumbs.querySelectorAll(".vthumb").forEach((b, idx) => {
    b.classList.toggle("active", idx === i);
  });
  const mainImg = document.querySelector(`.bag-card[data-bag-id="${currentBag.id}"] .bag-main-img`);
  if (mainImg) mainImg.src = v.image;
  hideError();
}

function currentWilaya() {
  return wilayas.find((x) => x.name === wilayaSelect.value) || null;
}

function selectedDeliveryPrice() {
  const w = currentWilaya();
  if (!w) return null;
  if (deliveryType === "office") return w.delivery_office != null ? w.delivery_office : w.delivery_home;
  return w.delivery_home;
}

function updateDeliveryOptions() {
  const w = currentWilaya();
  const unavailableTxt = I18N["js.unavailable"] || "Unavailable";
  const dash = w ? "" : "—";
  document.querySelectorAll(".delivery-option").forEach((opt) => {
    const input = opt.querySelector("input");
    const isOffice = input.value === "office";
    if (isOffice) {
      const unavailable = !w || w.delivery_office == null;
      input.disabled = unavailable;
      opt.classList.toggle("disabled", unavailable);
      if (unavailable && deliveryType === "office") {
        deliveryType = "home";
        const homeInput = document.querySelector('input[name="delivery_type"][value="home"]');
        if (homeInput) homeInput.checked = true;
      }
    }
  });
  deliveryHomePrice.textContent = w ? formatDA(w.delivery_home) : dash;
  deliveryOfficePrice.textContent = w ? (w.delivery_office != null ? formatDA(w.delivery_office) : unavailableTxt) : dash;
}

function updatePrices() {
  if (!currentBag) return;
  const qty = parseInt(qtyInput.value, 10) || 1;
  const bagTotal = currentBag.price * qty;
  const price = selectedDeliveryPrice();
  const noWilaya = I18N["js.no_wilaya"] || "Select wilaya";
  document.getElementById("priceBag").textContent = formatDA(bagTotal);
  document.getElementById("priceDelivery").textContent = price != null ? formatDA(price) : noWilaya;
  const total = price != null ? bagTotal + price : bagTotal;
  document.getElementById("priceTotal").textContent = price != null ? formatDA(total) : noWilaya;
  document.getElementById("summaryTotal").textContent = price != null ? formatDA(total) : noWilaya;
}

async function openCheckout(bagId) {
  hideError();
  currentBag = await getBag(bagId);
  if (!currentBag) return;
  currentVariant = 0;
  document.getElementById("summaryBag").textContent = currentBag.name;
  form.hidden = false;
  successBox.hidden = true;
  renderVariantThumbs();
  selectVariant(0);
  qtyInput.value = 1;
  deliveryType = "home";
  const homeInput = document.querySelector('input[name="delivery_type"][value="home"]');
  if (homeInput) homeInput.checked = true;
  updateDeliveryOptions();
  updatePrices();
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById("firstName").focus();
}

function closeCheckout() {
  modal.hidden = true;
  document.body.style.overflow = "";
}

document.addEventListener("click", (e) => {
  const dot = e.target.closest(".bag-card .dot");
  if (dot) {
    const card = dot.closest(".bag-card");
    const mainImg = card.querySelector(".bag-main-img");
    const idx = parseInt(dot.dataset.variant, 10);
    const variants = JSON.parse(card.dataset.bag).variants;
    if (variants[idx]) mainImg.src = variants[idx].image;
    card.querySelectorAll(".dot").forEach((b) => b.classList.toggle("active", b === dot));
    return;
  }
  const buyBtn = e.target.closest(".buy-btn");
  if (buyBtn) {
    const id = parseInt(buyBtn.dataset.bagId, 10);
    openCheckout(id);
    return;
  }
  const openBtn = e.target.closest(".open-checkout");
  if (openBtn) {
    const id = parseInt(openBtn.dataset.bagId, 10);
    openCheckout(id);
    return;
  }
  const carBtn = e.target.closest(".car-btn");
  if (carBtn) {
    const scroller = carBtn.closest(".carousel")?.querySelector(".scroller");
    if (!scroller) return;
    const dir = parseInt(carBtn.dataset.scroll, 10) || 1;
    const step = (scroller.querySelector(".bag-card")?.offsetWidth || scroller.clientWidth) * 0.85;
    const isRTL = document.dir === "rtl";
    const sign = isRTL ? -1 : 1;
    const max = scroller.scrollWidth - scroller.clientWidth;
    let target = scroller.scrollLeft + sign * dir * step;
    target = isRTL ? Math.max(-max, Math.min(0, target)) : Math.max(0, Math.min(max, target));
    scroller.scrollTo({ left: target, behavior: "smooth" });
    return;
  }
  const like = e.target.closest(".bag-like");
  if (like) {
    like.classList.toggle("liked");
    like.textContent = like.classList.contains("liked") ? "💜" : "♥";
  }
});

const newsletterForm = document.getElementById("newsletterForm");
if (newsletterForm) {
  newsletterForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("newsletterEmail");
    if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      email.focus();
      return;
    }
    newsletterForm.hidden = true;
    const done = document.getElementById("newsletterDone");
    if (done) done.style.display = "block";
  });
}

document.getElementById("closeModal").addEventListener("click", closeCheckout);
document.getElementById("closeAfterSuccess").addEventListener("click", () => {
  closeCheckout();
  form.reset();
  updateCities();
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) closeCheckout();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeCheckout();
});

wilayaSelect.addEventListener("change", () => {
  updateCities();
  updateDeliveryOptions();
  updatePrices();
  hideError();
});

document.querySelectorAll('input[name="delivery_type"]').forEach((input) => {
  input.addEventListener("change", () => {
    deliveryType = input.value;
    updateDeliveryOptions();
    updatePrices();
  });
});

document.getElementById("qtyMinus").addEventListener("click", () => {
  qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1);
  updatePrices();
});
document.getElementById("qtyPlus").addEventListener("click", () => {
  qtyInput.value = Math.min(20, (parseInt(qtyInput.value, 10) || 1) + 1);
  updatePrices();
});
qtyInput.addEventListener("change", () => {
  let v = parseInt(qtyInput.value, 10) || 1;
  v = Math.max(1, Math.min(20, v));
  qtyInput.value = v;
  updatePrices();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const variant = currentBag.variants[currentVariant];
  const payload = {
    first_name: document.getElementById("firstName").value.trim(),
    last_name: document.getElementById("lastName").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    wilaya: wilayaSelect.value,
    city: citySelect.value,
    bag_id: currentBag.id,
    color: variant ? variant.color : "",
    quantity: parseInt(qtyInput.value, 10) || 1,
    delivery_type: deliveryType,
    notes: document.getElementById("notes").value.trim(),
  };

  if (!payload.first_name || !payload.last_name) return showError(I18N["js.required_name"] || "Please enter your first and last name.");
  if (!payload.phone) return showError(I18N["js.required_phone"] || "Please enter your phone number.");
  if (!payload.wilaya) return showError(I18N["js.required_wilaya"] || "Please select your wilaya.");
  if (!payload.city) return showError(I18N["js.required_city"] || "Please select your municipality.");

  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = SENDING_LABEL;

  try {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) {
      showError(data.error || I18N["js.error_generic"] || "Something went wrong.");
      btn.disabled = false;
      btn.textContent = BUY_LABEL;
      return;
    }
    form.hidden = true;
    successBox.hidden = false;
    const colorTxt = data.order.color ? ` (${data.order.color})` : "";
    const delivLabel = data.order.delivery_type === "office" ? (I18N["checkout.deliv.office"] || "Delivery to office") : (I18N["checkout.deliv.home"] || "Home delivery");
    const infoTpl = I18N["checkout.success.info"] || "Order {id} — {bag}{color} × {qty} — {deliv} {price} — total {total}. We'll contact you on {phone}.";
    document.getElementById("successInfo").textContent = infoTpl
      .replace("{id}", data.order.order_id)
      .replace("{bag}", data.order.bag_name)
      .replace("{color}", colorTxt)
      .replace("{qty}", data.order.quantity)
      .replace("{deliv}", delivLabel)
      .replace("{price}", formatDA(data.order.delivery_price))
      .replace("{total}", formatDA(data.order.total))
      .replace("{phone}", data.order.phone);
  } catch (err) {
    showError(I18N["js.error_server"] || "Couldn't reach the server. Try again.");
  }
  btn.disabled = false;
  btn.textContent = BUY_LABEL;
});

loadWilayas();

/* ---------- Glam: scroll reveals ---------- */
const glamEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && glamEls.length) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  glamEls.forEach((el) => io.observe(el));
}

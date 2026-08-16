import json
import os
import re
import uuid
from datetime import datetime

from flask import (
    Flask,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
ORDERS_FILE = os.path.join(DATA_DIR, "orders.json")
BAGS_FILE = os.path.join(DATA_DIR, "bags.json")
WILAYAS_FILE = os.path.join(DATA_DIR, "wilayas.json")
DELIVERY_FILE = os.path.join(DATA_DIR, "delivery_prices.json")
TRANSLATIONS_FILE = os.path.join(DATA_DIR, "translations.json")

LANGUAGES = ("en",)
DEFAULT_LANG = "en"

DELIVERY_PRICE = 600  # fallback when a wilaya has no known price

ADMIN_PASSWORD = os.environ.get("KYO_ADMIN_PASSWORD", "kyo2026")

app = Flask(__name__)
app.config["JSON_AS_ASCII"] = False
app.secret_key = os.environ.get("KYO_SECRET", "kyo-secret-change-me")


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_orders():
    return load_json(ORDERS_FILE, [])


def load_bags():
    return load_json(BAGS_FILE, [])


def load_wilayas():
    return load_json(WILAYAS_FILE, [])


def load_translations():
    return load_json(TRANSLATIONS_FILE, {})


@app.before_request
def set_language():
    translations = load_translations()

    def t(key):
        entry = translations.get(key, {})
        return entry.get("en") or key

    g.lang = "en"
    g.dir = "ltr"
    g.t = t


@app.context_processor
def inject_i18n():
    def t(key):
        entry = load_translations().get(key, {})
        return entry.get("en") or key

    return {
        "lang": "en",
        "dir": "ltr",
        "t": getattr(g, "t", t),
        "i18n_js": {
            k: v.get("en")
            for k, v in load_translations().items()
            if k.startswith("js.") or k in ("checkout.success.info", "checkout.deliv.home", "checkout.deliv.office")
        },
    }


def load_delivery_prices():
    return load_json(DELIVERY_FILE, {})


def wilaya_code(name):
    for w in load_wilayas():
        if w["name"].lower() == str(name).strip().lower():
            return w["code"]
    return None


def delivery_price_map(code):
    return load_delivery_prices().get(str(code)) or {}


def delivery_price_for(code, delivery_type):
    prices = delivery_price_map(code)
    if not prices:
        return DELIVERY_PRICE
    price = prices.get(delivery_type)
    if price is None:
        return prices.get("home") or DELIVERY_PRICE
    return price


def wilaya_with_delivery(w):
    prices = load_delivery_prices().get(str(w["code"]), {})
    return {
        "code": w["code"],
        "name": w["name"],
        "cities": w["cities"],
        "delivery_home": prices.get("home", DELIVERY_PRICE),
        "delivery_office": prices.get("office"),
    }


@app.route("/")
def home():
    bags = load_bags()
    return render_template("index.html", bags=bags)


@app.route("/bags")
def bags_page():
    return render_template("bags.html", bags=load_bags())


@app.route("/api/wilayas")
def api_wilayas():
    return jsonify([wilaya_with_delivery(w) for w in load_wilayas()])


@app.route("/api/bags")
def api_bags():
    return jsonify(load_bags())


def normalize_phone(phone):
    phone = re.sub(r"[^0-9]", "", phone)
    if phone.startswith("213"):
        phone = "0" + phone[3:]
    if len(phone) == 9 and phone.startswith("0"):
        return phone
    if len(phone) == 10 and phone.startswith("0"):
        return phone
    return None


def validate_wilaya_city(wilaya_name, city_name):
    wilayas = load_wilayas()
    for w in wilayas:
        if w["name"].lower() == wilaya_name.strip().lower():
            cities = [c.lower() for c in w["cities"]]
            if city_name.strip().lower() in cities:
                return True
    return False


@app.route("/api/order", methods=["POST"])
def place_order():
    data = request.get_json(silent=True) or {}
    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    wilaya = (data.get("wilaya") or "").strip()
    city = (data.get("city") or "").strip()
    phone = normalize_phone(data.get("phone") or "")
    bag_id = data.get("bag_id")
    color = (data.get("color") or "").strip()
    quantity = int(data.get("quantity") or 1)
    notes = (data.get("notes") or "").strip()
    delivery_type = (data.get("delivery_type") or "home").strip().lower()
    if delivery_type not in ("home", "office"):
        delivery_type = "home"

    if not (first_name and last_name):
        return jsonify({"ok": False, "error": "الاسم واللقب إجباريان."}), 400
    if not phone:
        return jsonify({"ok": False, "error": "رقم الهاتف غير صالح (مثال: 0550123456)."}), 400
    if not wilaya or not city:
        return jsonify({"ok": False, "error": "الرجاء اختيار الولاية والبلدية."}), 400
    if not validate_wilaya_city(wilaya, city):
        return jsonify({"ok": False, "error": "بلدية غير صالحة لهذه الولاية."}), 400

    bag = next((b for b in load_bags() if b["id"] == int(bag_id)), None)
    if not bag:
        return jsonify({"ok": False, "error": "الحقيبة غير موجودة."}), 400
    if quantity < 1 or quantity > 20:
        return jsonify({"ok": False, "error": "كمية غير صالحة."}), 400

    code = wilaya_code(wilaya)
    if delivery_type == "office":
        office_price = delivery_price_map(code).get("office") if code else None
        if office_price is None:
            return jsonify({"ok": False, "error": "التوصيل للمكتب غير متوفر في هذه الولاية. اختاري التوصيل للمنزل."}), 400
        delivery_price = office_price
    else:
        delivery_price = delivery_price_for(code, "home") if code else DELIVERY_PRICE

    subtotal = bag["price"] * quantity
    total = subtotal + delivery_price

    order = {
        "order_id": "KYO-" + uuid.uuid4().hex[:8].upper(),
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "first_name": first_name,
        "last_name": last_name,
        "phone": phone,
        "wilaya": wilaya,
        "city": city,
        "bag_id": bag_id,
        "bag_name": bag["name"],
        "bag_price": bag["price"],
        "color": color,
        "quantity": quantity,
        "delivery_type": delivery_type,
        "delivery_price": delivery_price,
        "total": total,
        "notes": notes,
    }

    orders = load_orders()
    orders.append(order)
    save_json(ORDERS_FILE, orders)

    return jsonify({"ok": True, "order": order})


@app.route("/orders")
def orders_page():
    if not session.get("admin"):
        return render_template("login.html")
    return render_template("orders.html", orders=list(reversed(load_orders())))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if request.form.get("password", "") == ADMIN_PASSWORD:
            session["admin"] = True
            return redirect(url_for("orders_page"))
        return render_template("login.html", error="كلمة المرور غير صحيحة."), 401
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.pop("admin", None)
    return redirect(url_for("home"))


def admin_session():
    if not session.get("admin"):
        return True
    return False


def parse_price(value, fallback=0):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def save_bag_image(bag_id, uploaded_file, image_url):
    if uploaded_file and uploaded_file.filename:
        filename = f"b{bag_id}_{secure_filename(uploaded_file.filename)}"
        img_dir = os.path.join(BASE_DIR, "static", "images", "bags")
        os.makedirs(img_dir, exist_ok=True)
        uploaded_file.save(os.path.join(img_dir, filename))
        return f"static/images/bags/{filename}"
    return image_url.strip() or "static/images/bags/placeholder.svg"


@app.route("/admin/bags")
def admin_bags():
    if admin_session():
        return render_template("login.html")
    return render_template("admin_bags.html", bags=load_bags())


@app.route("/admin/bags/add", methods=["POST"])
def admin_bags_add():
    if admin_session():
        return redirect(url_for("login"))
    bags = load_bags()
    new_id = max((b["id"] for b in bags), default=0) + 1
    image = save_bag_image(
        new_id, request.files.get("image_file"), request.form.get("image_url", "")
    )
    bag = {
        "id": new_id,
        "name": (request.form.get("name") or "New bag").strip(),
        "description": (request.form.get("description") or "").strip(),
        "price": parse_price(request.form.get("price")),
        "category": (request.form.get("category") or "Classic").strip(),
        "featured": request.form.get("featured") == "1",
        "variants": [
            {
                "color": (request.form.get("color") or "Classic").strip(),
                "image": image,
                "swatch": (request.form.get("swatch") or "#b9a8d6").strip(),
            }
        ],
    }
    bags.append(bag)
    save_json(BAGS_FILE, bags)
    return redirect(url_for("admin_bags"))


@app.route("/admin/bags/<int:bag_id>/edit", methods=["GET", "POST"])
def admin_bags_edit(bag_id):
    if admin_session():
        return redirect(url_for("login"))
    bags = load_bags()
    bag = next((b for b in bags if b["id"] == bag_id), None)
    if not bag:
        return redirect(url_for("admin_bags"))
    if request.method == "POST":
        bag["name"] = (request.form.get("name") or bag["name"]).strip()
        bag["description"] = (request.form.get("description") or "").strip()
        bag["price"] = parse_price(request.form.get("price"), bag["price"])
        bag["category"] = (request.form.get("category") or bag["category"]).strip()
        bag["featured"] = request.form.get("featured") == "1"
        variant = bag["variants"][0]
        variant["color"] = (request.form.get("color") or variant["color"]).strip()
        variant["swatch"] = (request.form.get("swatch") or variant["swatch"]).strip()
        uploaded = request.files.get("image_file")
        if uploaded and uploaded.filename:
            variant["image"] = save_bag_image(bag_id, uploaded, "")
        else:
            url = (request.form.get("image_url") or "").strip()
            if url:
                variant["image"] = url
        save_json(BAGS_FILE, bags)
        return redirect(url_for("admin_bags"))
    return render_template("admin_bags_edit.html", bag=bag)


@app.route("/admin/bags/<int:bag_id>/delete", methods=["POST"])
def admin_bags_delete(bag_id):
    if admin_session():
        return redirect(url_for("login"))
    bags = load_bags()
    bags = [b for b in bags if b["id"] != bag_id]
    save_json(BAGS_FILE, bags)
    return redirect(url_for("admin_bags"))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

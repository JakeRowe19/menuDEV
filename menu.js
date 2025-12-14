// ----- НАСТРОЙКИ -----

const CSV_URL_BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRcUeH0R2aQgSWh0hhjkHEF2j3vSmWaFn-vpEvdl3wmgZavajJXslZR7zB8a8Wk3r2cKkXolnIXrq14/pub?output=csv";

const ITEMS_PER_SCREEN = 15;

// чтение CSV → массив объектов
async function fetchCsv() {
  // добавляем "мусорный" параметр, чтобы URL всегда был уникален
  const url = CSV_URL_BASE + `&t=${Date.now()}`;

  const res = await fetch(url, {
    cache: "no-store",        // просим браузер не использовать кэш
  });

  const text = await res.text();

  const lines = text.trim().split(/\r?\n/);
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const rows = lines.map(r => r.split(delimiter));

  const headers = rows[0].map(h => sanitize(h));
  const dataRows = rows.slice(1).filter(r => r[0].trim() !== "");

  return dataRows.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = sanitize(row[i] || "");
    });
    return obj;
  });
}




// соответствие beertype -> картинка бейджа
const BEERTYPE_BADGE = {
  "beertype=dark":    "beertype=dark.png",
  "beertype=darkNF":  "beertype=darkNF.png",
  "beertype=light":   "beertype=light.png",
  "beertype=lightNF": "beertype=lightNF.png",
  "beertype=other":   "beertype=other.png",
  "beertype=n/a":     "nonalc.png",
  "beertype=wheat":   "beertype=wheat.png",
  "beertype=cider":   "beertype=cider.png",
  "beertype=mead":   "beertype=mead.png"
};

// ----- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ -----

function stripQuotes(str) {
  if (str == null) return "";
  let s = String(str);

  // убираем одну пару внешних кавычек
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
  }

  // заменяем двойные кавычки внутри на одиночные
  s = s.replace(/""/g, '"');

  return s.trim();
}

function sanitize(value) {
  return stripQuotes(value);
}


// ----- МАППИНГ ПОЛЕЙ И СОСТОЯНИЙ -----

function getState(item) {
  const v = (item["instock"] || "").toLowerCase();
  if (v.includes("sale")) return "sale";
  if (v.includes("no"))   return "pending";
  if (v.includes("yes"))  return "instock";
  return "instock";
}

// Заголовок: в первую очередь столбец S "Наименование"
// (он уже содержит "1.Ратминское" и т.п.)
// если он вдруг пустой → подстрахуемся id + "название"
function formatTitle(item) {
  return item["Наименование"] || "";
}


// Строка "крепость + плотность":
// берём как есть из столбца R "Плотность°P"
function formatSpecs(item) {
  const abvRaw = Number(item["крепость"]);
  const ogRaw  = Number(item["плотность"]);
  
  const abv = abvRaw ? (abvRaw / 10).toFixed(1) + "%" : "";
  const og  = ogRaw ? ogRaw + "oG" : "";

  return [abv, og].filter(Boolean).join(" ");
}


// Цена
function formatPrice(item) {
  // 1. Базовая цена из столбца "цена"
  const rawBase = item["цена"] || item["Цена"] || "";

  // оставляем только цифры и точку
  const base = (() => {
    const cleaned = String(rawBase)
      .replace(",", ".")
      .replace(/[^0-9.]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? NaN : n;
  })();

  if (isNaN(base)) return "";

  // 2. Читаем столбец "Наличие" и вытаскиваем из него скидку в процентах
  const availability = (item["Наличие"] || "").toLowerCase();

  let discountPercent = 0;
  const match = availability.match(/(\d+)\s*%/); // ищем число перед %
  if (match) {
    discountPercent = Number(match[1]); // "скидка 15%" -> 15
  }

  // 3. Считаем цену со скидкой (если скидки нет, discountPercent = 0)
  const coef = 1 - discountPercent / 100;
  const final = Math.round(base * coef);

  return final + "₽";
}



// Страна
function getCountry(item) {
  return sanitize(item["Страна"]);
}

function getId(item) {
  return item["id"] || "";
}

function getName(item) {
  return item["название"] || "";
}


// Бейдж
function getBadge(item) {
  const bt = sanitize(item["beertype"]);
  if (!bt) return "";
  const file = BEERTYPE_BADGE[bt];
  if (!file) return "";
  return `<img class="badge" src="img/${file}" alt="${bt}">`;
}

// ----- ШАБЛОН КАРТОЧКИ -----

function cardTemplate(item) {
  const state   = getState(item);
  const id      = getId(item);
  const name    = getName(item);
  const specs   = formatSpecs(item);
  const country = getCountry(item);
  const badge   = getBadge(item);
  const price   = formatPrice(item);

  const priceHtml =
    state === "pending"
      ? `<span class="price-pending">В пути</span>`
      : `<span class="price">${price}</span>`;

  return `
    <div class="beer-card state-${state}">
      <div class="card-top">
        <div class="title-id">${id}</div>
        <div class="title">${name}</div>
      </div>

      <div class="card-bottom">
        <div class="divider"></div>

        <div class="info-line">
          <span class="country">${country}</span>
          ${badge ? `<span class="badge-wrap">${badge}</span>` : ""}
        </div>

        <div class="info-line">
          <span class="abv">${specs}</span>
          ${priceHtml}
        </div>
      </div>
    </div>
  `;
}


function orderCardTemplate() {
  return `
    <div class="beer-card state-order">
      <div class="card-top">
        <div class="title">Пиво под заказ</div>
      </div>

      <div class="card-bottom">
        <div class="divider"></div>

        <div class="info-line" style="justify-content:center; text-align:center;">
          <span class="order-text">
            Можете заказать у продавца
          </span>
        </div>
      </div>
    </div>
  `;
}




// ----- РЕНДЕР ЭКРАНА -----

async function renderScreen(screenNumber) {
  const container = document.getElementById("menu");
  if (!container) return;

  const allItems = await fetchCsv();

  // сортируем по id
  allItems.sort((a, b) => Number(a["id"]) - Number(b["id"]));

  const start = (screenNumber - 1) * ITEMS_PER_SCREEN;
  const end   = start + ITEMS_PER_SCREEN;
  let items   = allItems.slice(start, end);

  // 👉 если это ПОСЛЕДНИЙ экран — добавляем спец-карточку
  const totalScreens = Math.ceil(allItems.length / ITEMS_PER_SCREEN);
  if (screenNumber === totalScreens) {
    items.push({ __custom: "order" });
  }

  container.innerHTML = items.map(item => {
    if (item.__custom === "order") {
      return orderCardTemplate();
    }
    return cardTemplate(item);
  }).join("");
}








const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const {
  fetchStocks, fetchSales, buildSalesMap, buildArticleSalesStats,
  mapRows, ALERT_THRESHOLD, SALES_DAYS,
} = require("./stocks");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "0 9 * * *"; // каждый день в 9:00

if (!BOT_TOKEN) {
  console.error("Ошибка: задайте TELEGRAM_BOT_TOKEN в .env");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// --- Helpers ---

async function loadData() {
  const [stocks, sales] = await Promise.all([fetchStocks(), fetchSales()]);
  const salesMap = buildSalesMap(sales);
  const rows = mapRows(stocks, salesMap);
  return { rows, sales };
}

async function loadRows() {
  const { rows } = await loadData();
  return rows;
}

function truncate(text, limit = 4096) {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 20) + "\n\n... (обрезано)";
}

// --- /start ---
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    "WB Stocks Bot\n\n" +
    "Команды:\n" +
    "/art <артикул> — полная карточка товара\n" +
    "/critical — критичные остатки\n" +
    "/report — полный отчёт (статистика)\n" +
    "/stocks <предмет> — остатки по предмету\n" +
    "/oos — позиции с 0 на складе\n" +
    "/help — список команд\n\n" +
    `Ваш chat_id: ${msg.chat.id}`
  );
});

// --- /help ---
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    "/art <артикул> — полная карточка товара (остатки, продажи, прогноз)\n" +
    "/critical — критичные остатки (qty ≤ " + ALERT_THRESHOLD + ")\n" +
    "/report — сводка: всего / критичных / OOS / топ-10\n" +
    "/stocks <предмет> — остатки по предмету (напр. /stocks Шарфы)\n" +
    "/oos — все позиции с qty = 0\n" +
    "/subjects — список предметов (категорий товаров)"
  );
});

// --- /critical ---
bot.onText(/\/critical/, async (msg) => {
  try {
    bot.sendMessage(msg.chat.id, "Загружаю данные...");
    const rows = await loadRows();
    const alerts = rows
      .filter((r) => r.quantity <= ALERT_THRESHOLD && r.quantity > 0)
      .sort((a, b) => a.quantity - b.quantity);

    if (alerts.length === 0) {
      return bot.sendMessage(msg.chat.id, "Критичных позиций нет!");
    }

    const lines = alerts.slice(0, 50).map(
      (r) => `qty=${r.quantity} | ${r.warehouse} | ${r.supplierArticle} | ${r.brand}` +
        (r.daysUntilOOS !== null ? ` | ${r.daysUntilOOS}д` : "")
    );

    const text =
      `⚠️ Критичные остатки (qty ≤${ALERT_THRESHOLD})\n` +
      `Найдено: ${alerts.length}\n\n` +
      lines.join("\n");

    bot.sendMessage(msg.chat.id, truncate(text));
  } catch (err) {
    bot.sendMessage(msg.chat.id, "Ошибка: " + err.message);
  }
});

// --- /report ---
bot.onText(/\/report/, async (msg) => {
  try {
    bot.sendMessage(msg.chat.id, "Загружаю данные...");
    const rows = await loadRows();

    const total = rows.length;
    const critical = rows.filter((r) => r.stockStatus === "critical").length;
    const oos = rows.filter((r) => r.stockStatus === "out_of_stock").length;
    const inStock = rows.filter((r) => r.stockStatus === "in_stock").length;

    const top10 = rows
      .filter((r) => r.quantity <= ALERT_THRESHOLD)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 10)
      .map((r, i) =>
        `${i + 1}. qty=${r.quantity} | ${r.supplierArticle} | ${r.warehouse}` +
        (r.daysUntilOOS !== null ? ` | ${r.daysUntilOOS}д до OOS` : "")
      );

    const text =
      `📊 Отчёт по остаткам WB\n\n` +
      `Всего позиций: ${total}\n` +
      `✅ В наличии: ${inStock}\n` +
      `⚠️ Критичных (≤${ALERT_THRESHOLD}): ${critical}\n` +
      `🔴 Нет в наличии: ${oos}\n\n` +
      `Топ-10 критичных:\n` +
      top10.join("\n");

    bot.sendMessage(msg.chat.id, text);
  } catch (err) {
    bot.sendMessage(msg.chat.id, "Ошибка: " + err.message);
  }
});

// --- /oos ---
bot.onText(/\/oos/, async (msg) => {
  try {
    bot.sendMessage(msg.chat.id, "Загружаю данные...");
    const rows = await loadRows();
    const oosRows = rows.filter((r) => r.quantity === 0);

    if (oosRows.length === 0) {
      return bot.sendMessage(msg.chat.id, "Все позиции в наличии!");
    }

    const lines = oosRows.slice(0, 50).map(
      (r) => `${r.warehouse} | ${r.supplierArticle} | ${r.brand} | ${r.subject}`
    );

    const text =
      `🔴 Нет в наличии: ${oosRows.length}\n\n` +
      lines.join("\n");

    bot.sendMessage(msg.chat.id, truncate(text));
  } catch (err) {
    bot.sendMessage(msg.chat.id, "Ошибка: " + err.message);
  }
});

// --- /stocks <предмет> ---
bot.onText(/\/stocks(?:\s+(.+))?/, async (msg, match) => {
  const query = (match[1] || "").trim();
  if (!query) {
    return bot.sendMessage(msg.chat.id, "Укажите предмет, напр: /stocks Шарфы");
  }

  try {
    bot.sendMessage(msg.chat.id, "Загружаю данные...");
    const rows = await loadRows();
    const q = query.toLowerCase();
    const filtered = rows.filter((r) =>
      r.subject.toLowerCase().includes(q) ||
      r.supplierArticle.toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
      return bot.sendMessage(msg.chat.id, `Ничего не найдено по запросу «${query}»`);
    }

    const sorted = filtered.sort((a, b) => a.quantity - b.quantity);
    const lines = sorted.slice(0, 50).map(
      (r) => `qty=${r.quantity} | ${r.warehouse} | ${r.supplierArticle} | ${r.brand}` +
        (r.daysUntilOOS !== null ? ` | ${r.daysUntilOOS}д` : "")
    );

    const text =
      `🔍 «${query}» — найдено: ${filtered.length}\n\n` +
      lines.join("\n");

    bot.sendMessage(msg.chat.id, truncate(text));
  } catch (err) {
    bot.sendMessage(msg.chat.id, "Ошибка: " + err.message);
  }
});

// --- /art <артикул> — карточка товара ---
bot.onText(/\/art(?:\s+(.+))?/, async (msg, match) => {
  const query = (match[1] || "").trim();
  if (!query) {
    return bot.sendMessage(msg.chat.id, "Укажите артикул, напр: /art Шарф_клетка_2217_50");
  }

  try {
    bot.sendMessage(msg.chat.id, "Загружаю данные...");
    const { rows, sales } = await loadData();
    const q = query.toLowerCase();

    // Точное совпадение, затем частичное
    let matched = rows.filter((r) => r.supplierArticle.toLowerCase() === q);
    if (matched.length === 0) {
      matched = rows.filter((r) => r.supplierArticle.toLowerCase().includes(q));
    }

    if (matched.length === 0) {
      return bot.sendMessage(msg.chat.id, `Артикул «${query}» не найден`);
    }

    const article = matched[0].supplierArticle;
    const articleRows = rows.filter((r) => r.supplierArticle === article);
    const salesStats = buildArticleSalesStats(sales, article);

    const totalQty = articleRows.reduce((s, r) => s + r.quantity, 0);
    const minDays = articleRows
      .map((r) => r.daysUntilOOS)
      .filter((d) => d !== null);
    const avgPerDay = salesStats.sold / SALES_DAYS;

    // По складам
    const byWarehouse = articleRows
      .sort((a, b) => a.quantity - b.quantity)
      .map((r) =>
        `  ${r.warehouse}: ${r.quantity} шт` +
        (r.daysUntilOOS !== null ? ` (${r.daysUntilOOS}д)` : "")
      );

    const info = articleRows[0];
    const text =
      `📦 ${article}\n\n` +
      `Бренд: ${info.brand}\n` +
      `Категория: ${info.category}\n` +
      `Предмет: ${info.subject}\n` +
      `Цена: ${info.price} руб\n\n` +
      `📊 Остатки (всего: ${totalQty} шт):\n` +
      byWarehouse.join("\n") + "\n\n" +
      `📈 Продажи за ${SALES_DAYS} дн:\n` +
      `  Продано: ${salesStats.sold} шт\n` +
      `  Возвратов: ${salesStats.returned} шт\n` +
      `  Выручка: ${salesStats.revenue.toLocaleString("ru-RU")} руб\n` +
      `  Ср. в день: ${avgPerDay.toFixed(1)} шт/день\n\n` +
      (totalQty > 0 && avgPerDay > 0
        ? `⏳ Дней до OOS (общий): ~${Math.round(totalQty / avgPerDay)} дн`
        : totalQty === 0
          ? "🔴 Нет в наличии"
          : "⏳ Нет продаж — прогноз невозможен");

    bot.sendMessage(msg.chat.id, text);
  } catch (err) {
    bot.sendMessage(msg.chat.id, "Ошибка: " + err.message);
  }
});

// --- /subjects ---
bot.onText(/\/subjects/, async (msg) => {
  try {
    bot.sendMessage(msg.chat.id, "Загружаю данные...");
    const rows = await loadRows();
    const subjects = [...new Set(rows.map((r) => r.subject))].sort();

    const text = `📋 Предметы (${subjects.length}):\n\n` + subjects.join("\n");
    bot.sendMessage(msg.chat.id, truncate(text));
  } catch (err) {
    bot.sendMessage(msg.chat.id, "Ошибка: " + err.message);
  }
});

// --- Cron: утренний алерт ---
if (CHAT_ID) {
  cron.schedule(CRON_SCHEDULE, async () => {
    console.log(`[cron] Отправка утреннего алерта в ${CHAT_ID}...`);
    try {
      const rows = await loadRows();
      const critical = rows.filter((r) => r.quantity <= ALERT_THRESHOLD && r.quantity > 0);
      const oos = rows.filter((r) => r.quantity === 0);

      const top = critical
        .sort((a, b) => a.quantity - b.quantity)
        .slice(0, 20)
        .map((r) =>
          `qty=${r.quantity} | ${r.supplierArticle} | ${r.warehouse}` +
          (r.daysUntilOOS !== null ? ` | ${r.daysUntilOOS}д` : "")
        );

      const text =
        `📊 Утренний отчёт WB\n\n` +
        `Всего: ${rows.length}\n` +
        `⚠️ Критичных: ${critical.length}\n` +
        `🔴 OOS: ${oos.length}\n\n` +
        (top.length > 0 ? `Топ критичных:\n${top.join("\n")}` : "Критичных нет!");

      await bot.sendMessage(CHAT_ID, text);
      console.log("[cron] Алерт отправлен.");
    } catch (err) {
      console.error("[cron] Ошибка:", err.message);
    }
  });

  console.log(`Cron-расписание: ${CRON_SCHEDULE}`);
} else {
  console.log("TELEGRAM_CHAT_ID не задан — cron-алерты отключены.");
}

console.log("Бот запущен. Ожидание команд...");

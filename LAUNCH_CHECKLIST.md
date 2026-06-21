# 🚀 LAUNCH CHECKLIST — Прояв

> Єдиний документ дій ВЛАСНИКА між «код готовий» і «прод live».
> Код цього не зробить — це налаштування Supabase / Cloudflare / акаунтів.
> Позначай ✅ по виконанню. Порядок = від блокерів до рекомендованого.

---

## 🔴 БЛОКЕРИ — без цього не запускати

### 1. Supabase — повна міграція
SQL Editor → встав увесь `migrations/proyav_admin.sql` → Run. Безпечно повторно (IF NOT EXISTS / on conflict). **Містить нові секції:**
- **6** — лічильник «Першої серії» (`claim_first_series` / `release_first_series`) — без неї знижка рахується старим гонким методом.
- **7** — `expenses.photographer_id` — без неї облік виплат фотографам не віднімає вже виплачене (ризик подвійної оплати).
- **8** — `failed_orders` — без неї «впалі» замовлення не зберігаються (лишається тільки Telegram-пінг).

### 2. Перевірити таблицю `orders` (вона живе ЛИШЕ в Supabase, не в репо)
- CHECK-обмеження `source` має включати: `retail`, `package`, `photographer`.
- CHECK `status`: `new`, `uploaded`, `in_progress`, `sent`, `paid`.
- Колонки: `first_series` (boolean), `paid_at`, `shipped_at`, `uploaded_at`, `client_id`, `photographer_id`.
- Якщо чогось бракує — вставки падатимуть мовчки (тепер хоч у `failed_orders`).

### 3. Cloudflare Pages → Environment variables
| Змінна | Призначення | Стан |
|---|---|---|
| `ADMIN_PASSWORD` | вхід власника (майстер-ключ) — звір, що **довгий/випадковий** | ✅ задано |
| `TG_WEBHOOK_SECRET` | ОБОВ'ЯЗКОВИЙ (без нього вебхук = 403) | ✅ задано |
| `JWT_SECRET` | підпис токенів — довгий випадковий | ✅ задано |
| `SITE_URL` | канонічний домен для посилань клієнту (є й фолбек на origin запиту) | ✅ задано |
| `NOVA_POSHTA_KEY` | проксі Нової Пошти (міста/відділення) | ✅ задано |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | БД | ✅ задано |
| `TG_TOKEN`, `TG_CHAT_ID`, `TG_BOT_USERNAME` | сповіщення | ✅ задано |
| `GOOGLE_SA_KEY_B64`, `GOOGLE_SHEET_ID` | синк Google Sheets | ✅ задано |
| `MANAGER_PASSWORD` | окремий вхід менеджера (опц., без доступу до грошей) | ⚪ не задано (опц.) |
| R2 binding `PHOTOS` | архів кадрів | ✅ підключено |

### 4. Telegram webhook — зареєструвати з секретом
```
curl "https://api.telegram.org/bot<TG_TOKEN>/setWebhook" \
  -d "url=https://proyav.pages.dev/tg-webhook" \
  -d "secret_token=<TG_WEBHOOK_SECRET>"
```

### 5. Деактивувати старі ключі EmailJS
В акаунті EmailJS — старі `service_id`/`template_id`/`public_key` були публічними в коді раніше. Видалити/перевипустити.

### 6. Заповнити `config.js`
- `legal.taxId` (РНОКПП), `legal.email` (окремий робочий email) — юр-сторінки приховують порожні поля, але для запуску їх треба.
- `payment.card` (+ `payment.holder`) — щоб на екрані успіху клієнт ОДРАЗУ бачив суму й картку для переказу (інакше лишається «реквізити надішлемо особисто»).
- (рекомендовано показати юр-сторінки юристу.)

---

## 🟡 СИЛЬНО РЕКОМЕНДОВАНО — до серйозного трафіку

### 7. Cloudflare WAF — Rate Limiting Rules
Поточний rate-limit у коді — best-effort per-isolate. Реальний захист від брутфорсу/абʼюзу дає лише WAF. Мінімум на: `/api-admin-login`, `/api-*-login`, `/api-client-auth`, `/api-novaposhta`, `/send-order`, `/api-retail`.

### 8. Індекси `orders` (перевірити/створити в Supabase)
```sql
create unique index if not exists idx_orders_token on orders(token);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created on orders(created_at desc);
create index if not exists idx_orders_photographer on orders(photographer_id);
create index if not exists idx_orders_client on orders(client_id);
```

---

## ✅ ПЕРЕВІРКА ПІСЛЯ НАЛАШТУВАННЯ (smoke-test на проді)
1. Зробити тестове замовлення набору напряму → прийшов TG-пінг + з'явилось в `/admin`.
2. Завантажити 1 кадр → видно в drawer замовлення (R2 працює).
3. Зайти в `/partner` → зареєструватись → отримати посилання.
4. Замовити за посиланням фотографа → в адмінці бачимо прив'язку + комісію.
5. Перевести замовлення в `paid` → фотограф отримав TG-пінг, у клієнта в кабінеті — сповіщення.
6. Виплатити комісію в адмінці → «До виплати» зменшилось (не лишилось те саме!).
7. Перевірити `/privacy`, `/oferta`, `/partnerstvo` — реквізити підтягнулись.

---

*Оновлюй цей файл по мірі виконання. Решта (онлайн-еквайринг, email-провайдер, аналітичні алерти) — наступні ітерації, не блокери запуску.*

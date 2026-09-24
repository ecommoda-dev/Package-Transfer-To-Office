// ══════════════════════════════════════════════════════════════
// §HEADER
// Worker: package-transfer-to-office-worker — EcomModa
// Tool:   قسم تسليمات المكتب (Package Transfer To Office)
//
// skills: worker-builder v3.7.1 · constants v3.1.0 · order-lifecycle v1.8.0
//         · shopify-graphql-helper v1.1.0 · html-builder v6.6.0 — 24-09-2026
//
// 🔴 الأداة دي **مالهاش واجهة مستقلة** — الواجهة الوحيدة هي
//    `office-transfer.html` جوّه `Warehouse-Operations-Center`. الريبو ده
//    Worker وبس (قرار أحمد 15-09-2026).
//
// 🔴 **بتكتب `custom.package_whereabouts_s1`/`_s2` = 'Office'** — عهدة الطرد
//    الفعلية، مش حالة الأوردر. القاعدة الكاملة في `ecommoda-order-lifecycle`
//    قاعدة ١٧ و`references/package-whereabouts.md`.
// ══════════════════════════════════════════════════════════════
// 🔴 **السجل مشترك** — الأداة بتكتب تحت `metafields_change` زي سكانرَي بوسطة
//    بالظبط (قرار أحمد 15-09-2026)، والفصل بين الكُتّاب بمفتاح
//    **`extra.sourceTool`**.
// ⚠️ **ونتيجة مباشرة:** أي استعلام خط أساس على `metafields_change` **لازم
//    يفلتر على `extra.sourceTool`** — من غيره بيعدّ صفوف تلات أدوات مع بعض.
//    ودي بالظبط اللي التلات endpoints بتاعة السجل بتعملها تحت (`logParamsFrom`).
// ⚠️ و`type` بيفضل **من القيم المسجّلة أصلاً** للصف ده (`update` · `rejected`)
//    — صفر قيمة `type` جديدة، فـRule 7 مالهاش نطاق جديد هنا.
const TOOL_NAME      = 'metafields_change';
const SOURCE_TOOL    = 'package_transfer_to_office';
const WORKER_VERSION = '1.2.1';

// ══════════════════════════════════════════════════════════════
// §CONSTANTS
// ══════════════════════════════════════════════════════════════

// ─── §CONSTANTS::status — تُنسخ حرفيًا (worker-builder Step 5B) ───
// فرق حرف واحد = فلتر بيرجّع صفر صف **من غير أي خطأ**.
const S1_STATUS = {
  NEW_ORDER: 'New Order', CONFIRMED: 'Confirmed',
  WA_CONFIRMED: 'WhatsApp-Confirmed', WA_CANCELLED: 'WhatsApp-CANCELLED',
  CONFIRMED_EDIT: 'Confirmed + Edit', PENDING_EDIT: 'Pending Edit',
  READY: 'Ready', SHIPPED: 'Shipped', IN_RETURN: 'In-Return',
  DELIVERED: 'Delivered', RETURNED: 'Returned', CANCELLED: 'Cancelled',
};
const S2_STATUS = {
  CONFIRMED_RETURN: 'Confirmed + RETURN', CONFIRMED_EXCHANGE: 'Confirmed + EXCHANGE',
  READY: 'Ready', SHIPPED: 'Shipped', IN_RETURN: 'In-Return', RETURNED: 'Returned',
};

// ─── §CONSTANTS::whereabouts ───
// 🔴 الشكل `single_line_text_field` (Choice list) — و`metafieldsSet` بترفض
//    الكتابة كلها لو النوع مش مطابق بالحرف. `?action=diag` بيقرا التعريف
//    الحيّ ويقارنه، فتغيير التعريف من الأدمن بيبان في ٥ ثواني بدل ما يطلع
//    كفشل كتابة غامض على أول سكانة.
const WA_KEY      = { s1: 'package_whereabouts_s1', s2: 'package_whereabouts_s2' };
const WA_VALUES   = { WAREHOUSE: 'Warehouse', OFFICE: 'Office', COURIER: 'Courier' };
const WA_TYPE     = 'single_line_text_field';

// ─── §CONSTANTS::zone ───
// 🔴 الزون **قناة شحن مش جغرافيا** (`ecommoda-order-lifecycle` قاعدة ١٦).
//    و`package_whereabouts` **خارج نطاق `Other_Regions` بالكامل** — المكتب
//    محطة موجودة على قناة المناديب/الشو روم بس، وطرد بوسطة بيتسلّم من المخزن
//    نفسه وتتبّعه بييجي من بوسطة (قاعدة ١٧ · §2 في `package-whereabouts.md`).
const ZONE_IN_SCOPE = new Set(['Cairo+Giza', 'Show_Room']);
const COURIER_BOSTA = 'Bosta';

// ─── §CONSTANTS::caps — سلسلة السقوف التلاتة (worker-builder ⑪) ───
// ① الواجهة    CHUNK           = —    ← مفيش دفعة: السكان **فوري**، أوردر لكل نداء
// ② الـ Worker  MAX_BATCH       = —    ← مفيش endpoint بياخد مصفوفة
// ③ شوبيفاي     QUEUE_PAGE_SIZE = 50   ← تكلفة: الاستعلام ده بـ١٠ ميتافيلد لكل
//                                         نود، و50 اتأكدت حيًا (15-09-2026) من
//                                         غير MAX_COST_EXCEEDED. ⛔ متطلّعهاش
//                                         لـ100 من غير ما تقرا actualQueryCost.
const QUEUE_PAGE_SIZE = 50;
const QUEUE_MAX_PAGES = 6;          // حارس حلقة — 300 أوردر لكل ماكينة

// 🔴 **أرضية تاريخ الأوردر — رجعت نافذة متحرّكة (v1.2.0 · قرار أحمد
//    19-09-2026 · §٩ في `docs/query-cost-experiment.md` بريبو الهب)، وده
//    تراجع صريح عن قرار v1.1.0 (الأرضية الثابتة `2026-04-01`).**
//    ⚠️ **نفس القيمة بالحرف في `Package-Transfer-To-Warehouse`** — درس R1:
//    نافذتان مختلفتان على صفّين جنب بعض في الشاشة الرئيسية بتتقرا عطل.
//
//    🔴 **القرار اتاخد وهو عارف الثمن:** الأرضية الثابتة اتحطّت أصلاً عشان
//    نافذة متحركة قديمة (٣٠ يوم في أداة المرتجعات) كانت بتخفي الطرد المنسي
//    **بالظبط لما يبقى منسي فعلاً**. الثمن ده لسه صحيح، بس قرار أحمد الصريح
//    إنه مقبول مقابل استقرار التكلفة — راجع §٩ في الملف المرجعي لتفاصيل
//    التريد-أوف والبديل المؤجَّل (فهرس D1).
//    ⚠️ **شبكة الأمان المطلوبة — بند مفتوح، راجع «مسائل مفتوحة».**
//
//    ⚠️ **والفرق عن ٣٠ يوم القديمة:** ٢٥٠ يوم (~٨ شهور) — طرد منسي لمدة ٨
//    شهور حالة أندر بكتير من طرد منسي لمدة شهر.
//
// 🔴 **`ROLLING_WINDOW_DAYS` بيتحسب لحظيًا في كل نداء** — مش ثابت وقت
//    الـ cold start، عشان النافذة تفضل «آخر ٢٥٠ يوم من دلوقتي».
// ⚠️ **والفلتر على `created_at` مش `updated_at`** — تاريخ **الأوردر** هو
//    اللي الموظف بيقراه في الجدول وبيتصرّف عليه؛ `updated_at` بيتحرّك مع أي
//    تعديل (حتى كتابة الميتافيلد بتاعتنا نفسها)، فكان هيدّي أرضية بتتزحلق.
// ⚠️ **والصيغة `YYYY-MM-DD` بتتقرا UTC عند شوبيفاي** — الحساب بـUTC مباشرة،
//    بلا تحويل توقيت القاهرة، لأن فرق يوم على نافذة ٢٥٠ يوم أثره العملي صفر.
// 🔴 **وهي أرضية عرض — مش شرط أهلية.** الأوردر الأقدم منها **بيتسكن عادي**
//    والـ Worker بيكتب عليه؛ هو مش في القايمة وبس. ⛔ ممنوع تتحط في
//    `evaluate`.
const ROLLING_WINDOW_DAYS = 250;   // قرار أحمد 19-09-2026 (§٩) — نفس القيمة في أداة المخزن
function computeOrdersSince() {
  const ms = Date.now() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);   // YYYY-MM-DD — UTC
}
const SHOPIFY_API_VERSION = '2026-01';

// ══════════════════════════════════════════════════════════════
// §CORS — Option B (الأداة بتكتب على شوبيفاي)
// ══════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = ['https://ecommoda-dev.github.io'];
function getCORS(request) {
  const origin  = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

// ══════════════════════════════════════════════════════════════
// §HELPERS
// ══════════════════════════════════════════════════════════════
function json(data, status = 200, request = null) {
  const headers = { 'Content-Type': 'application/json' };
  Object.assign(headers, request ? getCORS(request) : { 'Access-Control-Allow-Origin': '*' });
  return new Response(JSON.stringify(data), { status, headers });
}

// ─── §HELPERS::time — توقيت القاهرة **يتحسب** مايتكتبش ثابت ───
// (`ecommoda-constants` §13 — نفس الدوال بالحرف في الـ Worker وفي الواجهة)
const CAIRO_TZ = 'Africa/Cairo';
const _cairoFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAIRO_TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function cairoParts(d) {
  const o = {};
  for (const p of _cairoFmt.formatToParts(d)) if (p.type !== 'literal') o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return o;
}
function cairoDate() { const p = cairoParts(new Date()); return `${p.year}-${p.month}-${p.day}`; }

// ════════════════════════════════════════════════════════════
// §LOG-REG — الحارس الديناميكي لقيم اللوج (الطبقة ٥ · worker-builder Step 7-ج)
// ════════════════════════════════════════════════════════════
// قطعة الأداة دي بس من log-values.json اللي جنبها — بتتحدّث معاه في نفس
// الـ commit. ممنوع شحن سجل الـ٣٢ أداة هنا (Step 7-ب عن ليه).
// المفتاح الزوج (tool, type) — الأداة دي بتكتب تحت `metafields_change` (سجل
// مشترك)، مش تحت اسمها هي، فمقارنة بـ`type` لوحده هتولّد تنبيه كاذب لو أداة
// تانية من الست كاتبين استخدمت نفس القيمة تحت `tool` مختلف.
const LOG_REGISTRY = {
  metafields_change: new Set(['rejected', 'update']),
};

const isRegisteredLogValue = (tool, type) => !!LOG_REGISTRY[tool]?.has(type);

// UPSERT على (source_tool, tool, type) — صف واحد لكل قيمة، hits بيعدّ.
// الحدث الكامل مش بيضيع: الصف الأصلي موجود في logs وعليه _unregistered،
// والجدول ده فهرس مش سجل تاني — عشان كده dedupe مش صف لكل حدث.
const LOG_ALERT_SQL = `
  INSERT INTO log_value_alerts
    (source_tool, tool, type, first_seen, last_seen, hits,
     worker_version, sample_order_name, sample_employee, sample_notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_tool, tool, type) DO UPDATE SET
    last_seen         = excluded.last_seen,
    hits              = log_value_alerts.hits + excluded.hits,
    worker_version    = excluded.worker_version,
    sample_order_name = excluded.sample_order_name,
    sample_employee   = excluded.sample_employee,
    sample_notes      = excluded.sample_notes,
    status            = CASE WHEN log_value_alerts.status = 'ignored'
                             THEN 'ignored' ELSE 'open' END
`;

// فشل التنبيه ممنوع يأثر على أي حاجة — try/catch صامت. بتجمّع التكرار جوّه
// نفس الدفعة في صف واحد (hits) قبل ما تكتب.
async function noteUnregisteredLogValues(db, entries) {
  const byPair = new Map();
  for (const e of entries) {
    const key = `${e.tool}\u0000${e.type}`;
    const acc = byPair.get(key);
    if (acc) { acc.hits++; continue; }
    byPair.set(key, { entry: e, hits: 1 });
  }
  const now = new Date().toISOString();
  for (const { entry, hits } of byPair.values()) {
    try {
      await db.prepare(LOG_ALERT_SQL).bind(
        SOURCE_TOOL, entry.tool ?? '(بدون tool)', entry.type ?? '(بدون type)',
        now, now, hits, WORKER_VERSION,
        entry.orderName ?? null, entry.employee ?? null,
        entry.notes ? String(entry.notes).slice(0, 200) : null,
      ).run();
    } catch (e) { /* متعمّد: التنبيه فهرس، وفشله أهون من تعطيل الأداة */ }
  }
}

// ══════════════════════════════════════════════════════════════
// §SHARED — copy verbatim from references/shared-functions.md — never modify
// ══════════════════════════════════════════════════════════════

async function writeLog(db, entry) {
  const unregistered = !isRegisteredLogValue(entry.tool, entry.type);
  const extra = unregistered
    ? { ...(entry.extra || {}), _unregistered: true }
    : entry.extra;

  await db.prepare(`
    INSERT INTO logs
      (timestamp, tool, type, employee, order_id, order_name,
       sku, product_title, delta, value_before, value_after, notes, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.timestamp    ?? new Date().toISOString(),
    entry.tool,
    entry.type,
    entry.employee     ?? null,
    entry.orderId      ?? null,
    entry.orderName    ?? null,
    entry.sku          ?? null,
    entry.productTitle ?? null,
    entry.delta        ?? null,
    entry.valueBefore  ?? null,
    entry.valueAfter   ?? null,
    entry.notes        ?? null,
    extra ? JSON.stringify(extra) : null
  ).run();

  // 🔴 مفيش رفض كتابة أبدًا — الصف اتكتب فعلاً، والتنبيه بعده وبصمت.
  if (unregistered) await noteUnregisteredLogValues(db, [entry]);
}

const LOG_EXPORT_MAX = 2000;

// ⚠️ **امتداد موثّق على §SHARED** — `results` و`machines` مش في نسخة المهارة،
//    وهما مضافين هنا بنفس الشكل اللي في سكانرَي بوسطة بالحرف. السبب إن
//    الواجهة بتعرض الفلترين دول، و**Worker بيتجاهل فلتر في صمت** معناه إن
//    الجدول بيقول إنه مفلتر وهو مش مفلتر — وده أسوأ من فلتر مش موجود.
//    ⛔ أي نسخ من المهارة فوق الكتلة دي بيشيل الفلترين من غير أي خطأ.
function buildLogFilterSQL(select, {
  tool      = null, sourceTool = null,
  employee  = null, employees = null,
  type      = null, types     = null,
  results   = null, machines  = null,
  search    = null,
  dateFrom  = null, dateTo    = null,
} = {}) {
  let sql = `${select} FROM logs WHERE type NOT IN ('login','logout')`;
  const b = [];

  const emps = Array.isArray(employees) && employees.length ? employees : (employee ? [employee] : []);
  const typs = Array.isArray(types)     && types.length     ? types     : (type     ? [type]     : []);

  if (tool) { sql += ' AND tool = ?'; b.push(tool); }
  // 🔴 **الفلتر ده مش اختياري** — `metafields_change` سجل مشترك بين تلات أدوات،
  //    ومن غيره تاب السجل بتاع الأداة دي بيعرض صفوف سكانرَي بوسطة كمان.
  //    ⚠️ والقيمة **مش من العميل** — `logParamsFrom` بتحطها ثابتة.
  if (sourceTool) {
    sql += ` AND json_extract(extra, '$.sourceTool') = ?`; b.push(sourceTool);
  }
  if (emps.length) {
    sql += ` AND employee IN (${emps.map(() => '?').join(',')})`; b.push(...emps);
  }
  if (typs.length) {
    sql += ` AND type IN (${typs.map(() => '?').join(',')})`; b.push(...typs);
  }
  const ress = Array.isArray(results)  && results.length  ? results  : [];
  const machs = Array.isArray(machines) && machines.length ? machines : [];
  if (ress.length) {
    sql += ` AND json_extract(extra, '$.result') IN (${ress.map(() => '?').join(',')})`; b.push(...ress);
  }
  if (machs.length) {
    sql += ` AND json_extract(extra, '$.machine') IN (${machs.map(() => '?').join(',')})`; b.push(...machs);
  }
  if (search) {
    sql += ' AND (order_name LIKE ? OR notes LIKE ?)';
    b.push(`%${search}%`, `%${search}%`);
  }
  if (dateFrom) { sql += ' AND substr(timestamp, 1, 10) >= ?'; b.push(dateFrom); }
  if (dateTo)   { sql += ' AND substr(timestamp, 1, 10) <= ?'; b.push(dateTo); }

  return { sql, b };
}

const LOG_SORT_COLUMNS = {
  date: 'timestamp', time: 'timestamp', employee: 'employee', orderName: 'order_name',
  machine: `json_extract(extra, '$.machine')`, result: `json_extract(extra, '$.result')`,
};

function orderByClause(sortBy, sortDir) {
  const col = LOG_SORT_COLUMNS[String(sortBy || '')] || 'timestamp';
  const dir = String(sortDir || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  // 🔴 كاسر تعادل إلزامي: من غيره صفوف نفس القيمة بترتيب عشوائي بين الصفحات.
  return col === 'timestamp' ? ` ORDER BY timestamp ${dir}`
                             : ` ORDER BY ${col} ${dir}, timestamp DESC`;
}

async function getLogs(db, { limit = 100, offset = 0, sortBy, sortDir, ...filters } = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT *', filters);
  const q = sql + orderByClause(sortBy, sortDir) + ' LIMIT ? OFFSET ?';
  return (await db.prepare(q)
    .bind(...b, Math.min(limit, 100), Math.max(offset, 0)).all()).results;
}

async function getLogsCount(db, filters = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT COUNT(*) as total', filters);
  const row = await db.prepare(sql).bind(...b).first();
  return row?.total ?? 0;
}

async function getLogsExport(db, filters = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT *', filters);
  const q = sql + ' ORDER BY timestamp DESC LIMIT ?';
  return (await db.prepare(q).bind(...b, LOG_EXPORT_MAX).all()).results;
}

function logParamsFrom(url, tool, sourceTool) {
  const csv = (k) => (url.searchParams.get(k) || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const employees = csv('employees'), types = csv('types');
  const results = csv('results'), machines = csv('machines');
  return {
    tool,
    // ⚠️ ثابتة من الكود — ممنوع تيجي من الـ query string، وإلا أي طلب معاه
    //    السر يقدر يقرا سجل أداة تانية على نفس الـ `tool`.
    sourceTool,
    employees: employees.length ? employees : null,
    employee:  url.searchParams.get('employee') || null,
    types:     types.length ? types : null,
    type:      url.searchParams.get('type')     || null,
    results:   results.length  ? results  : null,
    machines:  machines.length ? machines : null,
    search:    url.searchParams.get('search')   || null,
    dateFrom:  url.searchParams.get('dateFrom') || null,
    dateTo:    url.searchParams.get('dateTo')   || null,
  };
}

// ══════════════════════════════════════════════════════════════
// §SHOPIFY
// ══════════════════════════════════════════════════════════════
// 🔴 **retry/backoff — نفس انضباط `shopifyGQL` بالحرف (قرار أحمد 19-09-2026 ·
//    §٨② في `docs/query-cost-experiment.md` بريبو الهب).** كانت محاولة واحدة
//    بس، بينما `shopifyGQL` عندها ٣ محاولات وbackoff. السبب: الخمس Workers
//    (الطابعة · التغليف · تسليمات بوسطة · تسليمات المكتب · استلام المرتجعات)
//    بتشارك **نفس الـ Custom App** — قرار ثابت. لما الشاشة الرئيسية بتحمّل
//    الخمس طوابير بالتوازي، الخمسة بيطلبوا توكن OAuth **متزامن**، وفشل ٤٢٩
//    لحظي عابر كان بيتحوّل فورًا لفشل كامل بدل ما يتعافى.
//    ⚠️ **مش بديل عن §٨① (تفريق التوقيت في `index.html`)** — تصحيح عام
//    للستاك، والاتنين مع بعض هما اللي بيقللوا التزامن الفعلي.
async function getAccessToken(env) {
  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp, text;
    try {
      resp = await fetch(
        `https://${env.SHOP_DOMAIN}/admin/oauth/access_token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:     env.CLIENT_ID,
            client_secret: env.CLIENT_SECRET,
            grant_type:    'client_credentials',
          }),
        }
      );
      text = await resp.text();
    } catch (e) {
      lastErr = new Error(`OAuth: فشل الاتصال بشوبيفاي — ${e.message}`);
      if (attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
      throw lastErr;
    }

    if (!resp.ok) {
      const retriable = resp.status === 429 || resp.status >= 500;
      lastErr = new Error(`OAuth failed: ${resp.status} — ${text.slice(0, 180)}`);
      if (retriable && attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 700 * attempt)); continue; }
      throw lastErr;
    }

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`OAuth: رد شوبيفاي مش JSON صالح — ${text.slice(0, 180)}`); }
    if (!data.access_token) throw new Error('No access_token in response');
    return data.access_token;
  }
  throw lastErr || new Error('OAuth: فشل غير معروف');
}

// ─── §SHOPIFY::shopifyGQL — العقد الإلزامي، منسوخة كما هي ───
// أي فشل بيترمي: ① شبكة ② HTTP status ③ رد مش JSON ④ data.errors ⑤ data فاضية.
// ⚠️ ④ هو الخطير: ميوتيشن بتترفض على مستوى الحقل بترجّع {"errors":[…],"data":null}
//    و`userErrors` بتبقى `[]` — كود بيفحص `userErrors` بس بيقرا ده **نجاح**.
let _lastThrottle = null;   // بيتعرض في diag — الاقتراب من السقف مابيبانش غير بانفجار دفعة
// 🟡 **إضافة (قرار أحمد 19-09-2026 · §٨④ في `docs/query-cost-experiment.md`
//    بريبو الهب) — قياس تكلفة الاستعلام الحقيقية، نمط عام مش خاص بأداة
//    واحدة.** `throttleStatus` بيقول الرصيد المتبقي، **مش** تكلفة النداء
//    نفسه. `actualQueryCost` هو اللي بيتاكل من الرصيد فعليًا لكل نداء.
let _lastQueryCost = null;   // { op, requested, actual } — آخر نداء بس، نفس تحفّظ _lastThrottle فوق
async function shopifyGQL(env, token, query, variables = {}, opName = 'shopify', costLog = null) {
  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp, text;
    try {
      resp = await fetch(`https://${env.SHOP_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body:    JSON.stringify({ query, variables }),
      });
      text = await resp.text();
    } catch (e) {
      lastErr = new Error(`${opName}: فشل الاتصال بشوبيفاي — ${e.message}`);
      if (attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
      throw lastErr;
    }

    if (!resp.ok) {
      const retriable = resp.status === 429 || resp.status >= 500;
      lastErr = new Error(`${opName}: شوبيفاي ردّت HTTP ${resp.status} — ${text.slice(0, 180)}`);
      if (retriable && attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 700 * attempt)); continue; }
      throw lastErr;
    }

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`${opName}: رد شوبيفاي مش JSON صالح — ${text.slice(0, 180)}`); }

    if (Array.isArray(data.errors) && data.errors.length) {
      const codes = data.errors.map(e => e?.extensions?.code).filter(Boolean);
      lastErr = new Error(
        `${opName}: ${data.errors.map(e => e.message).join(' | ')}` +
        (codes.length ? ` [${codes.join(',')}]` : '')
      );
      if (codes.includes('THROTTLED') && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1200 * attempt)); continue;
      }
      throw lastErr;
    }

    if (!data.data) throw new Error(`${opName}: رد شوبيفاي بدون data — ${text.slice(0, 180)}`);
    if (data.extensions?.cost) {
      const c = data.extensions.cost;
      if (c.throttleStatus) _lastThrottle = c.throttleStatus;
      _lastQueryCost = { op: opName, requested: c.requestedQueryCost ?? null, actual: c.actualQueryCost ?? null };
      if (costLog) costLog.push({ op: opName, requested: c.requestedQueryCost ?? null, actual: c.actualQueryCost ?? null });
    }
    return data;
  }
  throw lastErr || new Error(`${opName}: فشل غير معروف`);
}

// ─── §HELPERS::assertEnv ───
const ENV_REQUIRED = { shopify: ['SHOP_DOMAIN', 'CLIENT_ID', 'CLIENT_SECRET'] };
function assertEnv(env, ...groups) {
  const missing = [];
  for (const g of groups) {
    for (const key of (ENV_REQUIRED[g] || [])) {
      if (env[key] === undefined || env[key] === null || String(env[key]).trim() === '') missing.push(key);
    }
  }
  if (!env.DB) missing.push('DB (D1 binding)');
  if (missing.length) {
    throw new Error(
      `متغيرات ناقصة في الـ Worker: ${missing.join('، ')} — ضِفها من ` +
      `Dashboard → Settings → Variables ثم Promote النسخة. (شغّل ?action=diag)`
    );
  }
}

// ══════════════════════════════════════════════════════════════
// §QUEUE — طابور «جاهز للتسليم للمكتب»
// ══════════════════════════════════════════════════════════════
//
// 🔴 **الـ Worker بيستعلم عن الحالة بس — الفلترة في الواجهة** (قرار أحمد
//    15-09-2026). السبب حقيقي ومقيس: `custom.package_whereabouts_s1` **مش
//    قابل للفلترة** في بحث شوبيفاي، والفلتر عليه **بيتجاهَل في صمت** ويرجّع
//    **المتجر كله** (١٠٬٠٠٠ صف — مقيس 15-09-2026). يعني فلترة الأهلية على
//    مستوى الاستعلام مستحيلة أصلاً.
//
// ⚠️ **وعشان كده الرد بيرجّع الحقول الخام لكل أوردر** (زون · مندوب · حالتين ·
//    وقتَي تغليف · عهدتَي الطرد · الإلغاء)، والواجهة بتحكم بيهم من **مصدر
//    واحد** — `wocOfficeGate` في `shared/shell.js` §OFFICE-GATE. الصفحة
//    والشاشة الرئيسية بينادوا **نفس الدالة** على **نفس الرد**، فمستحيل
//    الرقمين يفترقوا (درس R1 — v1.11.0: الرئيسية قالت ٦٦ والصفحة فتحت على ٦).
//
// 🔴 **بس الحارس الحقيقي على الكتابة في `?action=scan` تحت** — حارس في الواجهة
//    بس **مش حارس** (`ecommoda-order-lifecycle` §1.5): تاب مفتوح من ساعة
//    والأوردر اتلغى في الوقت ده كان هيعدّي. القاعدة واحدة، ومكان تنفيذها
//    اتنين بقرار: الواجهة بتقرر **إيه اللي يتعرض**، والـ Worker بيقرر **إيه
//    اللي يتكتب** — وهو المرجع.

// 🔴 **جزء الحقول واحد** — الطابور والسكان بيقروا **نفس** المجموعة بالحرف.
//    بناء الاستعلام التاني بـ`.replace()` على نص الأول كان بيفشل **في صمت**
//    لو مسافة اتغيّرت، فالحقول بتتعرّف مرة واحدة هنا وبتتركّب في التلاتة.
const ORDER_FIELDS = `
  id
  legacyResourceId
  name
  createdAt
  cancelledAt
  displayFulfillmentStatus
  currentSubtotalLineItemsQuantity
  currentTotalPriceSet { shopMoney { amount } }
  shippingAddress { name }
  zone:    metafield(namespace: "custom", key: "zone") { value }
  courier: metafield(namespace: "custom", key: "courier") { value }
  s1:      metafield(namespace: "custom", key: "manual_status") { value }
  s2:      metafield(namespace: "custom", key: "status_2_r_e") { value }
  p1:      metafield(namespace: "custom", key: "s1_packing_date_time") { value }
  p2:      metafield(namespace: "custom", key: "s2_packing_date_time") { value }
  pb1:     metafield(namespace: "custom", key: "s1_packed_by") { value }
  pb2:     metafield(namespace: "custom", key: "s2_packed_by") { value }
  w1:      metafield(namespace: "custom", key: "package_whereabouts_s1") { value }
  w2:      metafield(namespace: "custom", key: "package_whereabouts_s2") { value }
`;

const QUEUE_QUERY = `
query ReadyOrders($q: String!, $after: String, $n: Int!) {
  orders(first: $n, query: $q, sortKey: CREATED_AT, reverse: true, after: $after) {
    nodes { ${ORDER_FIELDS} }
    pageInfo { hasNextPage endCursor }
  }
}`;

// ─── §QUEUE::shapeOrder — شكل واحد للطابور وللسكان ───
// ⚠️ الشكل ده **عقد مع الواجهة**: `wocOfficeGate` في الـ shell بتقرا المفاتيح
//    دي بالاسم. تغيير اسم مفتاح هنا = الطابور يرجع فاضي **بلا أي خطأ**.
function shapeOrder(o) {
  return {
    orderId:   o.legacyResourceId || (o.id ? String(o.id).split('/').pop() : null),
    orderGid:  o.id,
    orderName: o.name,
    createdAt: o.createdAt,
    cancelledAt: o.cancelledAt || null,
    fulfillment: o.displayFulfillmentStatus || null,
    customer:  o.shippingAddress?.name || null,
    itemsQty:  o.currentSubtotalLineItemsQuantity ?? null,
    total:     o.currentTotalPriceSet?.shopMoney?.amount ?? null,
    zone:      o.zone?.value    || null,
    courier:   o.courier?.value || null,
    s1:        o.s1?.value      || null,
    s2:        o.s2?.value      || null,
    packedAtS1: o.p1?.value     || null,
    packedAtS2: o.p2?.value     || null,
    packedByS1: o.pb1?.value    || null,
    packedByS2: o.pb2?.value    || null,
    whereaboutsS1: o.w1?.value  || null,
    whereaboutsS2: o.w2?.value  || null,
  };
}

async function fetchReadyPage(env, token, q, opName, costLog) {
  const out = [];
  let after = null, pages = 0, truncated = false;
  while (pages < QUEUE_MAX_PAGES) {
    const data = await shopifyGQL(env, token, QUEUE_QUERY,
      { q, after, n: QUEUE_PAGE_SIZE }, opName, costLog);
    const conn = data.data?.orders;
    if (!conn) throw new Error('readyOrders: رد شوبيفاي بلا `orders`');
    out.push(...(conn.nodes || []));
    pages++;
    if (!conn.pageInfo?.hasNextPage) { after = null; break; }
    after = conn.pageInfo.endCursor;
    if (pages >= QUEUE_MAX_PAGES) truncated = true;
  }
  return { nodes: out, truncated };
}

// ─── §QUEUE::handleReadyQueue ───
// بيجيب **الماكينتين**: `manual_status = Ready` (شحنة أصلية) و
// `status_2_r_e = Ready` (دورة استبدال/استرجاع). أوردر ممكن يكون في الاتنين —
// بيتدمج بالـ id، والواجهة هي اللي بتقرر الماكينة (ومعاها تحذير الحالة الشاذة).
async function handleReadyQueue(env, request) {
  assertEnv(env, 'shopify');
  const token = await getAccessToken(env);
  const costLog = [];

  // ⚠️ الأرضية بتتحط على **الاستعلامين** — واحد من غيرها معناه إن ماكينة
  //    بتعرض أقدم من التانية، والجدول بيخلط النطاقين بلا أي إشارة.
  // 🔴 بتتحسب لحظيًا هنا مش مرة واحدة وقت الـ cold start.
  const ordersSince = computeOrdersSince();
  const floor = ` AND created_at:>=${ordersSince}`;

  const [a, b] = await Promise.all([
    fetchReadyPage(env, token, `metafields.custom.manual_status:'${S1_STATUS.READY}'${floor}`,
                   'readyOrders_s1', costLog),
    fetchReadyPage(env, token, `metafields.custom.status_2_r_e:'${S2_STATUS.READY}'${floor}`,
                   'readyOrders_s2', costLog),
  ]);

  const byId = new Map();
  for (const n of [...a.nodes, ...b.nodes]) {
    const s = shapeOrder(n);
    if (s.orderId) byId.set(s.orderId, s);
  }

  const totalActual = costLog.reduce((s, c) => s + (c.actual || 0), 0);

  return json({
    ok: true,
    orders: [...byId.values()],
    truncated: a.truncated || b.truncated,
    // 🔴 الأرضية بترجع في الرد عشان **الواجهة تعرضها من هنا** — مش مكتوبة
    //    بالإيد هناك. رقمان يفترقوا في صمت هو درس R1 بالحرف.
    ordersSince,
    fetchedAt: new Date().toISOString(),
    // 🟡 نمط عام (§٨④) — للقياس بس، مفيش أي اعتماد عليه من الواجهة.
    queryCost: {
      calls: costLog.length,
      totalActual,
      detail: costLog,
    },
  }, 200, request);
}

// ══════════════════════════════════════════════════════════════
// §SCAN — سكان باركود الأوردر → كتابة `Office`
// ══════════════════════════════════════════════════════════════

// ─── §SCAN::queries — مبنية من نفس `ORDER_FIELDS` ───
const ORDER_BY_ID_QUERY   = `query OrderById($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`;
const ORDER_BY_NAME_QUERY = `query OrderByName($q: String!) { orders(first: 5, query: $q) { nodes { ${ORDER_FIELDS} } } }`;

// ─── §SCAN::resolveOrder ───
// 🔴 **باركود الفاتورة بيشفّر الـ ID الرقمي** (١٠ خانات فأكتر)، واسم الأوردر
//    ٥ خانات. الرقم الطويل بيتقرا **قراءة بمفتاح**، والقصير **بحث**.
// ⚠️ والبحث بالاسم **بحث مش قراءة** (`shopify-graphql-helper`): `name:#5362`
//    بيطابق `#53621` كمان. المطابقة التامة على الاسم الراجع **إلزامية** —
//    من غيرها الأداة بتكتب `Office` على **أوردر تاني**.
async function resolveOrder(env, token, code) {
  const raw    = String(code || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { order: null, reason: 'الباركود ما فيهوش أرقام — اسكنه تاني' };

  if (digits.length >= 10) {
    const data = await shopifyGQL(env, token, ORDER_BY_ID_QUERY,
      { id: `gid://shopify/Order/${digits}` }, 'orderById');
    const node = data.data?.order;
    if (!node) return { order: null, reason: `مفيش أوردر على شوبيفاي بالرقم ${digits}` };
    return { order: shapeOrder(node) };
  }

  const wanted = `#${digits}`;
  const data   = await shopifyGQL(env, token, ORDER_BY_NAME_QUERY,
    { q: `name:${wanted}` }, 'orderByName');
  const nodes  = data.data?.orders?.nodes || [];
  const hit    = nodes.find(n => n.name === wanted);
  if (!hit) {
    return { order: null, reason: nodes.length
      ? `الأوردر ${wanted} مش موجود — البحث رجّع ${nodes.length} أوردر تاني، ومحدش منهم مطابق`
      : `الأوردر ${wanted} مش موجود على شوبيفاي` };
  }
  return { order: shapeOrder(hit) };
}

// ─── §SCAN::evaluate — الحكم، وهو **المرجع** ───
// بيرجّع { level, machine, code, message, warnings[] }:
//   blocked  → مفيش كتابة خالص · الشاشة حمرا بالسبب
//   already  → العهدة **هي المستهدفة أصلاً** — مفيش حاجة كانت مطلوبة
//              (`ecommoda-constants` §12: ⛔ ممنوع تتعدّ فشل وممنوع تاخد لون تحذير)
//   warn     → فيه شغل بس محتاج مراجعة — بيكمّل **بإقرار** (`ack`)
//   ok       → يتكتب على طول
// ⚠️ **الترتيب هو القرار:** الإلغاء **قبل** كل حاجة — أوردر ملغي متغلّف بيقول
//    «ملغي»، لأن ده اللي بيغيّر تصرّف الموظف (يفتح الطرد ويرجّع المخزون)،
//    مش «مش في الطابور».
function evaluate(o) {
  const warnings = [];

  // ① ملغي — ومعاه الفعل المطلوب بالنص
  if (o.cancelledAt || o.s1 === S1_STATUS.CANCELLED) {
    return { level: 'blocked', code: 'cancelled', machine: null,
      message: 'الأوردر ملغي — قطع الشحنة ورجّع المنتجات على الرف' };
  }

  // ② خارج النطاق — بوسطة
  // ⚠️ الفحص على المندوب **والزون** مع بعض: المندوب حقيقة متسجّلة عن الشحن،
  //    والزون قرار توجيه. أي واحد فيهم بيقول بوسطة = الطرد ده عمره ما هيعدّي
  //    على المكتب.
  if (o.courier === COURIER_BOSTA || o.zone === 'Other_Regions') {
    return { level: 'blocked', code: 'bosta', machine: null,
      message: 'الأوردر ده بيتشحن مع بوسطة — بوسطة بتستلم من المخزن والطرد مابيعدّيش على المكتب' };
  }
  if (!ZONE_IN_SCOPE.has(o.zone || '')) {
    return { level: 'blocked', code: 'zone', machine: null,
      message: `الزون «${o.zone || 'فاضي'}» مش من نطاق المكتب — النطاق: قاهرة+جيزة أو شو روم` };
  }

  // ③ الماكينة — S1 الأول، و S2 بشرط إن S1 وصل Delivered
  let machine = null;
  if (o.s1 === S1_STATUS.READY) machine = 's1';
  else if (o.s2 === S2_STATUS.READY && o.s1 === S1_STATUS.DELIVERED) machine = 's2';

  if (!machine) {
    // S2 جاهز بس S1 ما وصلش Delivered = حالة شاذة، مش رفض عادي — الرسالة
    // بتسمّي الحالتين عشان الموظف يعرف يسأل مين.
    if (o.s2 === S2_STATUS.READY) {
      return { level: 'blocked', code: 'status_s2_s1_not_delivered', machine: null,
        message: `دورة الاستبدال/الاسترجاع جاهزة بس الشحنة الأصلية لسه مش Delivered `
               + `(S1 = ${o.s1 || '—'}) — راجع حالة الأوردر الأول` };
    }
    return { level: 'blocked', code: 'status', machine: null,
      message: `حالة الأوردر مش Ready (S1 = ${o.s1 || '—'} · S2 = ${o.s2 || '—'})` };
  }

  // ④ متغلّف فعلاً — بميتافيلد الماكينة بتاعتها
  // 🔴 صف S2 بيتفحص بـ`s2_packing_date_time` **مش** `s1_…`. الفحص بـ`s1_…`
  //    على صف S2 بيعدّي على طرد **ما اتغلّفش** (مقيس 15-09-2026: ٦ من ٦
  //    صفوف S2 كانت هتعدّي، والصح ٢).
  const packedAt = machine === 's1' ? o.packedAtS1 : o.packedAtS2;
  if (!packedAt) {
    return { level: 'blocked', code: 'not_packed', machine,
      message: machine === 's1'
        ? 'الأوردر ما اتغلّفش لسه — مفيش وقت تغليف مسجّل عليه'
        : 'طرد الاستبدال/الاسترجاع ما اتغلّفش لسه — مفيش وقت تغليف (S2) مسجّل' };
  }

  // ⑤ العهدة الحالية
  const cur = machine === 's1' ? o.whereaboutsS1 : o.whereaboutsS2;
  if (cur === WA_VALUES.OFFICE) {
    return { level: 'already', code: 'already_office', machine,
      message: 'الطرد ده في المكتب خلاص — مفيش حاجة كانت مطلوبة' };
  }
  if (cur === WA_VALUES.COURIER) {
    return { level: 'blocked', code: 'at_courier', machine,
      message: 'الطرد ده مع المندوب خلاص — مينفعش يترجع للمكتب من هنا' };
  }
  if (cur && cur !== WA_VALUES.WAREHOUSE) {
    // Rule 13 — قيمة بره قايمة الاختيار: **بلّغ عنها، متحركهاش في صمت**
    warnings.push(`عهدة الطرد فيها قيمة غير معروفة: «${cur}»`);
  }

  // ⑥ الحالات الشاذة — بتظهر في القايمة وبتتسكن، بس **بإقرار**
  if (o.s1 === S1_STATUS.READY && o.s2 === S2_STATUS.READY) {
    warnings.push('الشحنة الأصلية ودورة الاستبدال **الاتنين** حالتهم Ready — '
                + 'هنسجّل على الشحنة الأصلية (S1). لو الطرد اللي في إيدك بتاع الاستبدال، اسأل الأول.');
  }
  const S1_KNOWN = new Set(Object.values(S1_STATUS));
  const S2_KNOWN = new Set(Object.values(S2_STATUS));
  if (o.s1 && !S1_KNOWN.has(o.s1)) warnings.push(`حالة S1 «${o.s1}» مش من القايمة المعتمدة`);
  if (o.s2 && !S2_KNOWN.has(o.s2)) warnings.push(`حالة S2 «${o.s2}» مش من القايمة المعتمدة`);

  if (warnings.length) {
    return { level: 'warn', code: 'anomaly', machine, warnings,
      message: 'الأوردر مؤهل، بس فيه حاجة محتاجة مراجعة قبل التسجيل' };
  }
  return { level: 'ok', code: 'ok', machine, warnings: [] };
}

// ─── §SCAN::writeWhereabouts ───
// التلات فحوصات (worker-builder Step 5A ②): top-level (جوّه `shopifyGQL`) →
// `userErrors` → **تأكيد الـ payload**. الفحص التالت هو اللي بيتنسى:
// `userErrors: []` معناها «مفيش اعتراض»، مش «اتنفّذت».
const SET_MF = `
mutation SetWhereabouts($mf: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $mf) {
    metafields { key value namespace }
    userErrors { field message code }
  }
}`;

async function writeWhereabouts(env, token, orderGid, machine) {
  const key  = WA_KEY[machine];
  const data = await shopifyGQL(env, token, SET_MF, {
    mf: [{ ownerId: orderGid, namespace: 'custom', key, type: WA_TYPE, value: WA_VALUES.OFFICE }],
  }, 'metafieldsSet');

  const res  = data.data?.metafieldsSet;
  const errs = res?.userErrors || [];
  if (errs.length) throw new Error('metafieldsSet: ' + errs.map(e => e.message).join(' | '));

  const wrote = (res?.metafields || []).find(m => m.key === key);
  if (!wrote) throw new Error('metafieldsSet: شوبيفاي ما أكدتش الكتابة (مفيش ميتافيلد راجع)');
  if (wrote.value !== WA_VALUES.OFFICE)
    throw new Error(`metafieldsSet: القيمة الراجعة «${wrote.value}» مش «${WA_VALUES.OFFICE}»`);
  return wrote.value;
}

// ─── §SCAN::handleScan ───
// 🔴 **قاعدة عدم الضياع (worker-builder ⑭): كل سكانة بتسيب صف واحد بالظبط** —
//    يا `transfer` يا `rejected`. صفر صفوف = سؤال «الأوردر ده اتسكن ولا لأ؟»
//    مالوش إجابة بعد ما الشاشة تتقفل.
//    ⚠️ **الاستثناء الوحيد:** حالة `needs_ack` — مفيش قرار اتاخد لسه، والسكانة
//       **هتكمّل** بصف كامل بعد الإقرار. صف هنا كان هيبقى صفّين لسكانة واحدة.
async function handleScan(env, request) {
  const body = await request.json().catch(() => ({}));
  const code     = String(body.code || '').trim();
  const employee = body.employee ? String(body.employee) : null;
  const ack      = body.ack === true;

  if (!code) return json({ ok: false, error: 'مفيش باركود في الطلب' }, 400, request);

  assertEnv(env, 'shopify');
  const token = await getAccessToken(env);

  const { order, reason } = await resolveOrder(env, token, code);

  // ① الأوردر نفسه مش موجود — صف رفض باسم اللي اتسكن (مفيش orderName)
  if (!order) {
    const logged = await safeLog(env, {
      tool: TOOL_NAME, type: 'rejected', employee,
      notes: reason,
      extra: { sourceTool: SOURCE_TOOL, result: 'rejected', stage: 'lookup',
               code: 'not_found', scanned: code },
    });
    return json({ ok: true, result: 'rejected', code: 'not_found',
      message: reason, scanned: code, ...logged }, 200, request);
  }

  const v = evaluate(order);

  // ② محتاج إقرار ولسه ما اقرّش — مفيش كتابة ومفيش صف
  if (v.level === 'warn' && !ack) {
    return json({ ok: true, result: 'needs_ack', code: v.code,
      message: v.message, warnings: v.warnings || [], machine: v.machine,
      order }, 200, request);
  }

  // ③ مرفوض / خلاص متعمل — صف بلا أي لمسة على شوبيفاي
  if (v.level === 'blocked' || v.level === 'already') {
    const result = v.level === 'already' ? 'already' : 'rejected';
    const logged = await safeLog(env, {
      tool: TOOL_NAME, type: 'rejected', employee,
      orderId: order.orderId, orderName: order.orderName,
      valueBefore: currentWhereabouts(order, v.machine), valueAfter: null,
      notes: v.message,
      extra: { sourceTool: SOURCE_TOOL, result, stage: 'lookup', code: v.code,
               machine: machineLabel(v.machine),
               zone: order.zone, courier: order.courier, s1: order.s1, s2: order.s2 },
    });
    return json({ ok: true, result, code: v.code, message: v.message,
      order, machine: v.machine, ...logged }, 200, request);
  }

  // ④ الكتابة
  const before = currentWhereabouts(order, v.machine);
  let wrote = null, error = null;
  try {
    wrote = await writeWhereabouts(env, token, order.orderGid, v.machine);
  } catch (e) { error = e.message; }

  const result = error ? 'error' : (v.warnings && v.warnings.length ? 'warning' : 'success');
  const logged = await safeLog(env, {
    // ⚠️ `update` مش `transfer` — القيمة دي **مسجّلة أصلاً** لصف
    //    `metafields_change` في `ecommoda-constants` §7، والفصل بيحصل بـ
    //    `extra.sourceTool`. قيمة `type` جديدة كانت هتفتح بند Rule 7 بلا داعي.
    tool: TOOL_NAME, type: 'update', employee,
    orderId: order.orderId, orderName: order.orderName,
    valueBefore: before, valueAfter: error ? null : WA_VALUES.OFFICE,
    notes: error || (v.warnings || []).join(' · ') || null,
    extra: {
      sourceTool: SOURCE_TOOL,
      result, stage: 'write', machine: machineLabel(v.machine),
      zone: order.zone, courier: order.courier, s1: order.s1, s2: order.s2,
      packedAt: v.machine === 's1' ? order.packedAtS1 : order.packedAtS2,
      packedBy: v.machine === 's1' ? order.packedByS1 : order.packedByS2,
      acknowledged: ack || undefined,
      warnings: (v.warnings && v.warnings.length) ? v.warnings : undefined,
      cairoDate: cairoDate(),
    },
  });

  return json({
    ok: !error, result, code: error ? 'write_failed' : 'written',
    message: error || null, order, machine: v.machine,
    warnings: v.warnings || [], valueBefore: before, valueAfter: wrote, ...logged,
  }, 200, request);
}

function currentWhereabouts(o, machine) {
  if (!machine) return null;
  return (machine === 's1' ? o.whereaboutsS1 : o.whereaboutsS2) || null;
}
function machineLabel(machine) {
  return machine === 's1' ? 'S1' : machine === 's2' ? 'S2' : null;
}

// ⚠️ فشل D1 **بيبان** — مفيش `.catch(() => {})`. العملية على شوبيفاي حصلت
//    فعلاً، والواجهة لازم تحذّر إن مفيش أثر في السجل.
async function safeLog(env, entry) {
  try { await writeLog(env.DB, entry); return { logged: true }; }
  catch (e) { return { logged: false, logError: e.message }; }
}

// ══════════════════════════════════════════════════════════════
// §DIAG
// ══════════════════════════════════════════════════════════════
// الشكل المعتمد للجديد: **مصفوفة** `[{ ok, label, detail }]` — `ok` صريحة.
// ⛔ ممنوع يرجّع قيمة أي سر — الأسماء والأطوال بس.
const DEF_QUERY = `
query Defs {
  currentAppInstallation { accessScopes { handle } }
  metafieldDefinitions(ownerType: ORDER, namespace: "custom", first: 100) {
    nodes { key type { name } validations { name value } }
  }
}`;

async function handleDiag(env, request) {
  const checks = [];
  const push = (ok, label, detail, hint) => checks.push({ ok, label, detail, hint });

  // ① المتغيرات — أسماء وأطوال بس
  const names = ['SHOP_DOMAIN', 'CLIENT_ID', 'CLIENT_SECRET', 'WORKER_SECRET'];
  const envDetail = names.map(k => {
    const v = env[k];
    return `${k}=${v === undefined || v === null || String(v).trim() === '' ? '❌ ناقص' : String(v).length + ' حرف'}`;
  }).join(' · ');
  const envOk = names.every(k => env[k] !== undefined && String(env[k] ?? '').trim() !== '');
  push(envOk, 'متغيرات وأسرار الـ Worker', envDetail,
       'Dashboard → Settings → Variables، وبعدها **Promote** للنسخة — من غير Promote القيمة بتفضل undefined');

  // ② D1
  try {
    // ⚠️ العدّ بـ`sourceTool` كمان — من غيره الرقم بيشمل صفوف سكانرَي بوسطة
    //    وبيقول «فيه صفوف» على أداة لسه ما كتبتش ولا صف.
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM logs WHERE tool = ? AND json_extract(extra, '$.sourceTool') = ?`
    ).bind(TOOL_NAME, SOURCE_TOOL).first();
    push(true, 'D1 (DB)', `متصلة — ${row?.n ?? 0} صف للأداة دي (من سجل ${TOOL_NAME} المشترك)`);
  } catch (e) {
    push(false, 'D1 (DB)', `FAILED: ${e.message}`,
         'binding اسمه `DB` في `wrangler.toml` — أي اسم تاني = كتابة فاشلة بصمت');
  }

  // ③ شوبيفاي + الصلاحيات + **تعريف الميتافيلد الحيّ**
  try {
    assertEnv(env, 'shopify');
    const token = await getAccessToken(env);
    const data  = await shopifyGQL(env, token, DEF_QUERY, {}, 'diag');
    push(true, 'OAuth شوبيفاي', 'التوكن اتجاب بنجاح');

    const scopes = (data.data?.currentAppInstallation?.accessScopes || []).map(s => s.handle);
    push(scopes.includes('write_orders'), 'صلاحية write_orders',
         scopes.includes('write_orders') ? 'موجودة' : 'ناقصة — الكتابة على الميتافيلد هتفشل',
         'Custom App → Configuration → Admin API access scopes');

    // 🔴 الفحص ده هو اللي بيمسك «التعريف اتغيّر من الأدمن» في ٥ ثواني بدل ما
    //    يطلع كفشل كتابة غامض على أول سكانة من الموظف.
    const defs = data.data?.metafieldDefinitions?.nodes || [];
    for (const m of ['s1', 's2']) {
      const key = WA_KEY[m];
      const d   = defs.find(x => x.key === key);
      if (!d) { push(false, `تعريف ${key}`, 'مش موجود على شوبيفاي',
                     'Settings → Custom data → Orders — لازم Choice list بقيم Warehouse · Office · Courier'); continue; }
      const typeOk = d.type?.name === WA_TYPE;
      const choices = (() => {
        try { return JSON.parse(d.validations?.find(v => v.name === 'choices')?.value || '[]'); }
        catch { return []; }
      })();
      const choiceOk = choices.includes(WA_VALUES.OFFICE);
      push(typeOk && choiceOk, `تعريف ${key}`,
           `type=${d.type?.name} · choices=[${choices.join(', ')}]`,
           !typeOk ? `النوع لازم يبقى ${WA_TYPE} بالحرف — غير كده metafieldsSet بترفض الكتابة كلها`
                   : `قيمة «${WA_VALUES.OFFICE}» مش في قايمة الاختيار`);
    }
  } catch (e) {
    push(false, 'شوبيفاي', `FAILED: ${e.message}`);
  }

  // ④ أرضية تاريخ الأوردر — معلومة، مش نجاح ولا فشل
  push(true, 'أرضية تاريخ الأوردر', `نافذة متحرّكة ${ROLLING_WINDOW_DAYS} يوم — الطابور بيعرض `
    + `أوردرات من ${computeOrdersSince()} فأحدث · `
    + `سقف ${QUEUE_PAGE_SIZE * QUEUE_MAX_PAGES} أوردر لكل ماكينة`,
    'الأرضية عرض بس — الأوردر الأقدم منها بيتسكن عادي والـ Worker بيكتب عليه. '
    + 'شبكة الأمان المطلوبة مع النافذة المتحرّكة (تقرير دوري) بند مفتوح — راجع CLAUDE.md');

  // ⑤ تكلفة الاستعلام — الاقتراب من السقف مابيبانش غير بانفجار دفعة كاملة
  push(true, 'رصيد تكلفة الاستعلام (throttleStatus)', _lastThrottle
    ? `currentlyAvailable=${_lastThrottle.currentlyAvailable} / ${_lastThrottle.maximumAvailable} · restoreRate=${_lastThrottle.restoreRate}/s`
    : 'لسه مفيش استعلام في الاستدعاء ده');
  // 🟡 نمط عام (§٨④) — `actualQueryCost` تكلفة آخر نداء فعليًا، مش الرصيد المتبقي.
  push(true, 'تكلفة آخر نداء (actualQueryCost)', _lastQueryCost
    ? `${_lastQueryCost.op}: requested=${_lastQueryCost.requested} · actual=${_lastQueryCost.actual}`
    : 'لسه مفيش استعلام في الاستدعاء ده');

  // ⑥ الأصل
  const origin = request.headers.get('Origin') || '(بلا Origin)';
  push(ALLOWED_ORIGINS.includes(origin), 'الـ Origin', `${origin} · المسموح: ${ALLOWED_ORIGINS.join(', ')}`);

  return json({ ok: checks.every(c => c.ok), version: WORKER_VERSION,
                tool: TOOL_NAME, sourceTool: SOURCE_TOOL, checks }, 200, request);
}

// ══════════════════════════════════════════════════════════════
// §HANDLER
// ══════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: getCORS(request) });

    // 🔴 حارس السر الغايب **قبل** فحص الـ auth — من غيره القالب بينتج السلسلة
    //    الحرفية "Bearer undefined"، يعني أي طلب معاه الهيدر ده **بيعدّي**،
    //    والحالة اللي المفروض تبقى «كل حاجة 401» بتتحوّل لـ«الحماية اتشالت».
    if (typeof env.WORKER_SECRET !== 'string' || !env.WORKER_SECRET.trim())
      return json({ ok: false, error: 'WORKER_SECRET غير مضبوط على الـ Worker', step: 'env' }, 500, request);

    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.WORKER_SECRET}`)
      return json({ error: 'Unauthorized' }, 401, request);

    const url    = new URL(request.url);
    const action = url.searchParams.get('action') || '';

    try {
      // ─── §CONFIG ──────────────────────────────────────────────
      if (action === 'get_config')
        return json({ ok: true, version: WORKER_VERSION, WORKER_VERSION,
                      tool: TOOL_NAME, sourceTool: SOURCE_TOOL }, 200, request);

      if (action === 'diag') return await handleDiag(env, request);

      // ─── §AUTH ────────────────────────────────────────────────
      // 🔴 **انحراف مقصود:** مفيش `check_employee`/`register_pin`/
      //    `verify_employee`/`log_logout` هنا. الأداة **مالهاش واجهة مستقلة**،
      //    والدخول بيحصل **مرة واحدة** في `index.html` بتاع الهب عبر Worker
      //    التغليف، والهوية بتوصل من `sessionStorage`. نقطة دخول تانية هنا =
      //    سطح هجوم بلا مستهلك (نفس قرار `order-sku-barcode-printer-worker`).
      //    ⚠️ و`get_employees` **موجود** لأنه مستهلَك فعلاً — فلتر الموظف في
      //       تاب السجل. من غيره الفلتر بيفضل فاضي **بلا أي خطأ**.
      if (action === 'get_employees') {
        const rows = await env.DB.prepare(
          'SELECT username, display_name FROM employees WHERE is_active = 1 ORDER BY display_name'
        ).all();
        return json({ ok: true, employees: rows.results || [] }, 200, request);
      }

      // ─── §QUEUE ───────────────────────────────────────────────
      if (action === 'get_ready_to_office') return await handleReadyQueue(env, request);

      // ─── §SCAN ────────────────────────────────────────────────
      if (action === 'scan') {
        if (request.method !== 'POST') return json({ error: 'POST required' }, 405, request);
        return await handleScan(env, request);
      }

      // ─── §LOG-ENDPOINTS ───────────────────────────────────────
      if (action === 'get_logs') {
        const p = logParamsFrom(url, TOOL_NAME, SOURCE_TOOL);
        // 🔴 parseInt('abc') → NaN → بيوصل لـ D1 كـ bind ويرجّع خطأ غامض.
        const limitRaw  = parseInt(url.searchParams.get('limit')  || '100', 10);
        const offsetRaw = parseInt(url.searchParams.get('offset') || '0',   10);
        const limit  = Number.isFinite(limitRaw)  ? Math.min(Math.max(limitRaw, 1), 100) : 100;
        const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
        const entries = await getLogs(env.DB, {
          ...p, limit, offset,
          sortBy:  url.searchParams.get('sortBy'),
          sortDir: url.searchParams.get('sortDir'),
        });
        return json({ ok: true, entries }, 200, request);
      }

      if (action === 'get_logs_count') {
        const total = await getLogsCount(env.DB, logParamsFrom(url, TOOL_NAME, SOURCE_TOOL));
        return json({ ok: true, total }, 200, request);
      }

      if (action === 'get_logs_export') {
        const p = logParamsFrom(url, TOOL_NAME, SOURCE_TOOL);
        const [entries, total] = await Promise.all([
          getLogsExport(env.DB, p),
          getLogsCount(env.DB, p),
        ]);
        return json({ ok: true, entries, cap: LOG_EXPORT_MAX, total,
                      truncated: total > LOG_EXPORT_MAX }, 200, request);
      }

      return json({ error: `Unknown action: ${action}` }, 404, request);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, request);
    }
  },
};

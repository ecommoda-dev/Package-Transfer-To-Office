<div dir="rtl" style="text-align: right;">

# قسم تسليمات المكتب — Package Transfer To Office

![worker](https://img.shields.io/badge/worker-v1.1.0-blue)

**Worker بس — مفيش واجهة في الريبو ده.**

الأداة بتسجّل انتقال الطرد من **المخزن للمكتب**: الموظف بيسكن باركود الأوردر،
والـ Worker بيكتب `custom.package_whereabouts_s1` (أو `_s2` لدورة الاستبدال/
الاسترجاع) بقيمة **`Office`**.

🔗 **الواجهة:** https://ecommoda-dev.github.io/Warehouse-Operations-Center/Package-Transfer-To-Office.html
(صفحة `Package-Transfer-To-Office.html` جوّه ريبو `Warehouse-Operations-Center`)

> ⛔ **ممنوع يتضاف `index.html` هنا.** الأداة **مالهاش نسخة مستقلة بقرار**
> (أحمد · 15-09-2026) — الدخول بيحصل مرة واحدة في الهب، والسر سر مجموعة
> `warehouse_ops`.

## نطاق الأداة

بتشتغل على أوردرات **قاهرة+جيزة والشو روم** بس.
🔴 **بوسطة خارج النطاق بالكامل** — بتستلم من المخزن نفسه وطردها عمره ما بيعدّي
على المكتب، وتتبّعه بييجي من بوسطة.

## Endpoints

```
GET  ?action=get_config           نسخة الـ Worker
GET  ?action=diag                 فحص ذاتي بلا كتابة (بيقرا تعريف الميتافيلد الحيّ)
GET  ?action=get_employees        فلتر الموظف في تاب السجل
GET  ?action=get_ready_to_office  أوردرات Ready من 2026-04-01 فأحدث بحقولها الخام
POST ?action=scan                 قراءة حيّة + حكم + metafieldsSet + صف D1
GET  ?action=get_logs[_count|_export]
```

## النشر

منشور من git عبر **Workers Builds** على `main`.
الأسرار من الداشبورد ثم **Promote**: `WORKER_SECRET` (= سر مجموعة
`warehouse_ops`) · `CLIENT_ID` · `CLIENT_SECRET`.

التفاصيل والقرارات والفخاخ → **`CLAUDE.md`**

</div>

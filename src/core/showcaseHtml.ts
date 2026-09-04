/**
 * Сборка витрины в один самодостаточный HTML-файл.
 *
 * Самодостаточный буквально: ни одного внешнего запроса. Стили внутри,
 * картинки — data URI, шрифты системные. Файл открывается с флешки, лежит
 * на любом хостинге и не ломается, когда чужой CDN уходит на профилактику.
 * Заодно это значит, что страница ничего не сообщает о посетителе — ни нам,
 * ни мастерской, ни третьим лицам.
 *
 * Всё, что приходит от человека, экранируется. Текст мастерской — не враждебный
 * вход, но профиль и витрину переносят файлом между компьютерами, а файл может
 * прийти откуда угодно. Ломать чужую страницу кавычкой в названии породы
 * инструмент не должен.
 */
import { itemTitle, visibleItems, type ShowcaseItem } from './showcase';
import { t } from './i18n';

export interface ShowcaseContacts {
  /** Телефон в любом виде: из него делаются `tel:` и ссылка в WhatsApp. */
  phone: string;
  /** Имя пользователя в Telegram, с собакой или без. */
  telegram: string;
  email: string;
  /** Сайт или страница мастерской. */
  site: string;
}

export interface ShowcasePage {
  workshop: string;
  about: string;
  logoDataUri: string;
  contacts: ShowcaseContacts;
  items: ShowcaseItem[];
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Только цифры: `wa.me` не понимает ни плюса, ни скобок, ни пробелов. */
export function phoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Российские номера пишут и с восьмёркой, и с семёркой — в международную
  // ссылку идёт семёрка, иначе WhatsApp не найдёт абонента.
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  return digits;
}

export function telegramHandle(telegram: string): string {
  return telegram.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
}

function siteUrl(site: string): string {
  const trimmed = site.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Ссылки «написать» для одной карточки. Текст подставляется заранее, чтобы
 * мастерская получила не «здравствуйте», а «доска 525×525, рецепт A7F3».
 */
export function contactLinks(
  contacts: ShowcaseContacts,
  item: ShowcaseItem
): { label: string; href: string }[] {
  const subject = `${itemTitle(item)}${item.code ? ` (рецепт № ${item.code})` : ''}`;
  const message = `Здравствуйте! Интересует ${subject}.`;
  const links: { label: string; href: string }[] = [];

  const digits = phoneDigits(contacts.phone);
  if (digits) {
    links.push({
      label: 'Написать в WhatsApp',
      href: `https://wa.me/${digits}?text=${encodeURIComponent(message)}`,
    });
  }

  const handle = telegramHandle(contacts.telegram);
  if (handle) {
    // У личных чатов Telegram нет параметра с текстом — ссылка просто открывает
    // диалог. Номер рецепта поэтому напечатан в самой карточке.
    links.push({ label: 'Написать в Telegram', href: `https://t.me/${handle}` });
  }

  if (digits) links.push({ label: 'Позвонить', href: `tel:+${digits}` });

  if (contacts.email.trim()) {
    links.push({
      label: 'Написать письмо',
      href: `mailto:${contacts.email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
    });
  }

  return links;
}

const CARE_KEYS = [
  'passport.care.wash',
  'passport.care.soak',
  'passport.care.oil',
  'passport.care.dry',
] as const;

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0 20px 56px;
  font: 16px/1.55 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #241a12;
  background: #faf7f3;
}
.wrap { max-width: 1120px; margin: 0 auto; }
header.top {
  display: flex; align-items: center; gap: 16px;
  padding: 28px 0 20px; border-bottom: 1px solid #e2d8cc;
}
header.top img { width: 64px; height: 64px; object-fit: contain; }
h1 { margin: 0; font-size: 26px; letter-spacing: -0.01em; }
.contact { margin: 4px 0 0; color: #6f6152; font-size: 14px; }
.contact a { color: #8a5a2b; }
.about { margin: 20px 0 0; max-width: 62ch; color: #4a3c2f; }
h2 { margin: 36px 0 14px; font-size: 19px; }
.grid {
  display: grid; gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
}
.card {
  display: flex; flex-direction: column;
  border: 1px solid #e2d8cc; border-radius: 14px; background: #fff; overflow: hidden;
}
.card img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #f0e9e0; display: block; }
.card .body { padding: 14px 16px 16px; display: flex; flex-direction: column; flex: 1; }
.card h3 { margin: 0 0 6px; font-size: 17px; line-height: 1.3; }
.card .desc { margin: 0 0 12px; color: #574636; font-size: 14px; }
.spec { margin: 0 0 12px; padding: 0; list-style: none; font-size: 13.5px; color: #6f6152; }
.spec li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; border-bottom: 1px dashed #ece3d8; }
.spec li:last-child { border-bottom: 0; }
.spec b { color: #241a12; font-weight: 600; text-align: right; }
.price { margin: 2px 0 12px; font-size: 21px; font-weight: 700; }
.price small { font-size: 13px; font-weight: 400; color: #6f6152; }
.actions { margin-top: auto; display: flex; flex-wrap: wrap; gap: 8px; }
.actions a {
  display: inline-block; padding: 9px 14px; border-radius: 9px;
  background: #8a5a2b; color: #fff; text-decoration: none; font-size: 14px; font-weight: 600;
}
.actions a + a { background: #fff; color: #8a5a2b; border: 1px solid #d9c7b2; }
.care { margin: 34px 0 0; padding: 20px 22px; border-radius: 14px; background: #fff; border: 1px solid #e2d8cc; }
.care h2 { margin-top: 0; }
.care ul { margin: 0; padding-left: 20px; color: #4a3c2f; }
.care li { margin-bottom: 8px; }
footer { margin: 36px 0 0; padding-top: 16px; border-top: 1px solid #e2d8cc; color: #6f6152; font-size: 13px; }
@media (max-width: 520px) {
  body { padding: 0 14px 40px; }
  header.top { flex-direction: column; align-items: flex-start; gap: 10px; }
  h1 { font-size: 22px; }
}
`.trim();

function specRow(label: string, value: string): string {
  return `<li><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></li>`;
}

function card(item: ShowcaseItem, contacts: ShowcaseContacts): string {
  const rows = [
    specRow(
      'Размер',
      `${Math.round(item.lengthMm)} × ${Math.round(item.widthMm)} × ${Math.round(item.thicknessMm)} мм`
    ),
    item.species.length ? specRow('Породы', item.species.join(', ')) : '',
    item.massKg > 0 ? specRow('Масса', `${item.massKg.toFixed(1)} кг`) : '',
    item.leadTime ? specRow('Срок', item.leadTime) : '',
    item.code ? specRow('Рецепт №', item.code) : '',
  ]
    .filter(Boolean)
    .join('\n        ');

  const price =
    item.priceRub > 0
      ? `<p class="price">${escapeHtml(Math.round(item.priceRub).toLocaleString('ru-RU'))} ₽</p>`
      : '<p class="price"><small>Цена по запросу</small></p>';

  const actions = contactLinks(contacts, item)
    .slice(0, 2)
    .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join('\n          ');

  // Пустой alt намеренно: подпись под картинкой дублировала бы заголовок,
  // а экранный диктор прочитал бы её дважды.
  const image = item.imageDataUri
    ? `<img src="${escapeHtml(item.imageDataUri)}" alt="" />`
    : '';

  return `      <article class="card">
        ${image}
        <div class="body">
          <h3>${escapeHtml(itemTitle(item))}</h3>
          ${item.description ? `<p class="desc">${escapeHtml(item.description)}</p>` : ''}
          <ul class="spec">
        ${rows}
          </ul>
          ${price}
          <div class="actions">
          ${actions}
          </div>
        </div>
      </article>`;
}

/**
 * Собрать страницу. Возвращает строку — записать её в файл или открыть
 * предпросмотром решает вызывающий код.
 */
export function buildShowcaseHtml(page: ShowcasePage): string {
  const items = visibleItems(page.items);
  const workshop = page.workshop.trim() || 'Мастерская';
  const title = `${workshop} — торцевые разделочные доски`;

  const contactBits: string[] = [];
  const digits = phoneDigits(page.contacts.phone);
  if (digits) contactBits.push(`<a href="tel:+${digits}">${escapeHtml(page.contacts.phone)}</a>`);
  const handle = telegramHandle(page.contacts.telegram);
  if (handle) contactBits.push(`<a href="https://t.me/${escapeHtml(handle)}">@${escapeHtml(handle)}</a>`);
  if (page.contacts.email.trim()) {
    const mail = page.contacts.email.trim();
    contactBits.push(`<a href="mailto:${escapeHtml(mail)}">${escapeHtml(mail)}</a>`);
  }
  const site = siteUrl(page.contacts.site);
  if (site) contactBits.push(`<a href="${escapeHtml(site)}">${escapeHtml(page.contacts.site.trim())}</a>`);

  const logo = page.logoDataUri
    ? `<img src="${escapeHtml(page.logoDataUri)}" alt="" />`
    : '';

  const cards = items.map((item) => card(item, page.contacts)).join('\n');

  const care = CARE_KEYS.map((key) => `      <li>${escapeHtml(t(key))}</li>`).join('\n');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(`Торцевые разделочные доски ручной работы. ${workshop}.`)}" />
<meta name="referrer" content="no-referrer" />
<style>
${STYLE}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    ${logo}
    <div>
      <h1>${escapeHtml(workshop)}</h1>
      <p class="contact">${contactBits.join(' · ')}</p>
    </div>
  </header>

  ${page.about.trim() ? `<p class="about">${escapeHtml(page.about.trim())}</p>` : ''}

  <h2>Доски в наличии и под заказ</h2>
  <div class="grid">
${cards}
  </div>

  <section class="care">
    <h2>Как ухаживать за торцевой доской</h2>
    <ul>
${care}
    </ul>
  </section>

  <footer>
    <p>Дерево живое: рисунок и оттенок каждой доски свой, тон со временем темнеет.
    Небольшое сезонное движение — норма, а не брак.</p>
    <p>Страница собрана в End-Grain Compiler и работает без интернета:
    ни счётчиков, ни внешних запросов, ни сбора данных о посетителях.</p>
  </footer>
</div>
</body>
</html>
`;
}

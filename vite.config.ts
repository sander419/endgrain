import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * Content-Security-Policy прод-сборки.
 *
 * Ставится мета-тегом, а не заголовком nginx, сознательно: политика едет вместе
 * со статикой, поэтому не разъезжается с кодом и не требует доступа к серверу —
 * тот, кто выкатывает `dist/`, выкатывает и защиту.
 *
 * Что она закрывает по делу: `connect-src 'self'` и `img-src` без внешних хостов
 * не дают странице ничего отправить наружу и ни за чем сходить, даже если в
 * рецепт из чужой ссылки просочится адрес (санитайзер в core/sanitize.ts —
 * первый рубеж, это второй).
 *
 * `style-src` вынужденно с 'unsafe-inline': React ставит inline-стили через
 * атрибут style, и без этого рассыпаются образцы пород и раскладка.
 * `frame-ancestors` в мета-теге не действует — от вставки в чужой фрейм
 * защищает заголовок X-Frame-Options на сервере.
 */
const CSP = [
  "default-src 'self'",
  // data: и blob: — печатный лист и «отпечаток» рисуют картинку из канваса,
  // а фотография пользователя читается локально через FileReader.
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

/**
 * Только для `vite build`: в dev-режиме тот же мета-тег ломает HMR, которому
 * нужны inline-скрипты и eval.
 */
function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cspMeta()],
  // Сайт живёт на хосте под путём /endgrain/, не в корне домена — относительный
  // base, чтобы собранные assets/*.js резолвились от текущего пути, а не от
  // корня сайта (иначе на проде под /endgrain/ они улетали бы в /assets/ и 404).
  base: './',
})

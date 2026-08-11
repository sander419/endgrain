import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Сайт живёт на хосте под путём /endgrain/, не в корне домена — относительный
  // base, чтобы собранные assets/*.js резолвились от текущего пути, а не от
  // корня сайта (иначе на проде под /endgrain/ они улетали бы в /assets/ и 404).
  base: './',
})

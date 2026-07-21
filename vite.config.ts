import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://adamhindman.github.io/query-builder/ — assets need the
// project-page prefix. Dev server is unaffected (base only applies to build).
//
// The `react` plugin exists solely so the one MUI X date field (see
// `ui/dateField.tsx`) can be mounted — the rest of the app is still plain
// DOM, no React elsewhere.
export default defineConfig({
  base: '/query-builder/',
  plugins: [react()],
})

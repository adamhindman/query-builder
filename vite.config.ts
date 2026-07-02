import { defineConfig } from 'vite'

// Served from https://adamhindman.github.io/query-builder/ — assets need the
// project-page prefix. Dev server is unaffected (base only applies to build).
export default defineConfig({
  base: '/query-builder/',
})

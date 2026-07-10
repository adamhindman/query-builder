// `plotly.js-basic-dist-min` ships no types of its own; it's the same API
// surface as `plotly.js`, just a smaller trace-type bundle, so reuse
// @types/plotly.js's definitions for it. It's a UMD bundle
// (`module.exports = Plotly`), and Vite/Rollup's CJS interop always exposes
// that as a `default` export on dynamic `import()` — declared as a default
// export here (rather than `export = `) to match that at the type level.
declare module 'plotly.js-basic-dist-min' {
  import * as Plotly from 'plotly.js'
  const plotly: typeof Plotly
  export default plotly
}

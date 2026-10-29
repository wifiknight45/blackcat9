// Flat config, hand-rolled: no presets beyond the rules listed, so a
// finding always means something specific. Browser code in js/,
// node code in test/ — different globals, different blocks.
const browserGlobals = {
  window: "readonly", document: "readonly", console: "readonly",
  innerWidth: "readonly", innerHeight: "readonly", addEventListener: "readonly",
  localStorage: "readonly", setTimeout: "readonly", setInterval: "readonly",
  clearInterval: "readonly", requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly", URL: "readonly", Blob: "readonly",
  AudioContext: "readonly", OfflineAudioContext: "readonly",
  WheelEvent: "readonly", Float32Array: "readonly", DataView: "readonly",
  ArrayBuffer: "readonly", Math: "readonly", JSON: "readonly",
  Object: "readonly", Array: "readonly", Number: "readonly",
  String: "readonly", Boolean: "readonly", Promise: "readonly",
  Error: "readonly", BigInt: "readonly", parseInt: "readonly",
  parseFloat: "readonly", isFinite: "readonly", Intl: "readonly",
  Date: "readonly", Map: "readonly", Set: "readonly",
};
const nodeGlobals = {
  console: "readonly", process: "readonly", URL: "readonly",
  setTimeout: "readonly", clearTimeout: "readonly", Buffer: "readonly",
  Float32Array: "readonly", DataView: "readonly", ArrayBuffer: "readonly",
  Math: "readonly", JSON: "readonly", Object: "readonly",
  Array: "readonly", Number: "readonly", String: "readonly",
  Promise: "readonly", Error: "readonly", BigInt: "readonly",
};
const rules = {
  "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  "no-undef": "error",
  "eqeqeq": "error",
  "no-var": "error",
  "prefer-const": "warn",
};
export default [
  { files: ["js/**/*.js"], languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: browserGlobals }, rules },
  { files: ["test/**/*.mjs"], languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: nodeGlobals }, rules },
  { files: ["*.js"], languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: nodeGlobals }, rules },
];


  import {createRequire as ___nfyCreateRequire} from "node:module";
  import {fileURLToPath as ___nfyFileURLToPath} from "node:url";
  import {dirname as ___nfyPathDirname} from "node:path";
  let __filename=___nfyFileURLToPath(import.meta.url);
  let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
  let require=___nfyCreateRequire(import.meta.url);
  
import {
  child_2_default
} from "./chunk-TG2FBIGG.js";

// test/fixtures/monorepo_npm_module/node_modules/parent-3/index.js
var parent_3_default = (input) => `<parent-3>${child_2_default(input)}</parent-3>`;

// test/fixtures/monorepo_npm_module/packages/frontend/.netlify/edge-functions-serve/bundled-parent-3.js
var bundled_parent_3_default = parent_3_default;
export {
  bundled_parent_3_default as default
};


  import {createRequire as ___nfyCreateRequire} from "node:module";
  import {fileURLToPath as ___nfyFileURLToPath} from "node:url";
  import {dirname as ___nfyPathDirname} from "node:path";
  let __filename=___nfyFileURLToPath(import.meta.url);
  let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
  let require=___nfyCreateRequire(import.meta.url);
  
import {
  child_2_default
} from "./chunk-TG2FBIGG.js";

// test/fixtures/monorepo_npm_module/node_modules/parent-2/index.js
var parent_2_default = (input) => `<parent-2>${child_2_default(input)}</parent-2>`;

// test/fixtures/monorepo_npm_module/packages/frontend/.netlify/edge-functions-serve/bundled-parent-2.js
var bundled_parent_2_default = parent_2_default;
export {
  bundled_parent_2_default as default
};

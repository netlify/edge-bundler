
  import {createRequire as ___nfyCreateRequire} from "node:module";
  import {fileURLToPath as ___nfyFileURLToPath} from "node:url";
  import {dirname as ___nfyPathDirname} from "node:path";
  let __filename=___nfyFileURLToPath(import.meta.url);
  let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
  let require=___nfyCreateRequire(import.meta.url);
  
import {
  child_1_default
} from "./chunk-TGI6VY77.js";

// test/fixtures/monorepo_npm_module/node_modules/parent-1/index.js
var parent_1_default = (input) => `<parent-1>${child_1_default(input)}</parent-1>`;

// test/fixtures/monorepo_npm_module/packages/frontend/.netlify/edge-functions-serve/bundled-parent-1.js
var bundled_parent_1_default = parent_1_default;
export {
  bundled_parent_1_default as default
};

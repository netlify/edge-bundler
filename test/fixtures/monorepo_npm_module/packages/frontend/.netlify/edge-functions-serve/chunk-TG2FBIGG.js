
  import {createRequire as ___nfyCreateRequire} from "node:module";
  import {fileURLToPath as ___nfyFileURLToPath} from "node:url";
  import {dirname as ___nfyPathDirname} from "node:path";
  let __filename=___nfyFileURLToPath(import.meta.url);
  let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
  let require=___nfyCreateRequire(import.meta.url);
  

// test/fixtures/monorepo_npm_module/node_modules/grandchild-1/index.js
import { cwd } from "process";
var grandchild_1_default = (input) => `<grandchild-1>${input}<cwd>${cwd()}</cwd></grandchild-1>`;

// test/fixtures/monorepo_npm_module/node_modules/child-2/index.js
var child_2_default = (input) => `<child-2>${grandchild_1_default(input)}</child-2>`;

export {
  child_2_default
};

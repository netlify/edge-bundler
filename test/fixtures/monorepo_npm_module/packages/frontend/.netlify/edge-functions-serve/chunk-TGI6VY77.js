
  import {createRequire as ___nfyCreateRequire} from "node:module";
  import {fileURLToPath as ___nfyFileURLToPath} from "node:url";
  import {dirname as ___nfyPathDirname} from "node:path";
  let __filename=___nfyFileURLToPath(import.meta.url);
  let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
  let require=___nfyCreateRequire(import.meta.url);
  

// test/fixtures/monorepo_npm_module/node_modules/child-1/index.js
import { readFileSync } from "fs";
import { join } from "path";
var child_1_default = (input) => {
  try {
    const filePath = input === "one" ? "file1.txt" : "file2.txt";
    const fileContents = readFileSync(join(__dirname, "files", filePath));
    console.log(fileContents);
  } catch {
  }
  return `<child-1>${input}</child-1>`;
};

export {
  child_1_default
};

import { boot } from "https://edge.netlify.com/bootstrap/index-combined.ts";

const functions = {}; const metadata = { functions: {} };


      try {
        const { default: func } = await import("file:///Users/eduardoboucas/Sites/netlify/edge-bundler/test/fixtures/monorepo_npm_module/packages/frontend/functions/func1.ts");

        if (typeof func === "function") {
          functions["func1"] = func;
          metadata.functions["func1"] = {"url":"file:///Users/eduardoboucas/Sites/netlify/edge-bundler/test/fixtures/monorepo_npm_module/packages/frontend/functions/func1.ts"}
        } else {
          console.log("The Edge Function \"func1\" has failed to load. Does it have a function as the default export?");
        }
      } catch (error) {
        console.log("There was an error with Edge Function \"func1\".");
        console.error(error);
      }
      

boot(functions, metadata);
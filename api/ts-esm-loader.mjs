// ts-esm-loader.mjs
// ------------------
// Local test-only Node ESM resolve hook.
//
// Every relative import inside api/*.ts is written ending in `.js` (the
// project's CRITICAL ESM RULE — see verification.ts/referenceData.ts
// headers): on Vercel, each .ts file is compiled to a sibling .js file, so a
// specifier like `./referenceData.js` correctly resolves to the compiled
// `./referenceData.js` output at runtime.
//
// Locally, `node --test` runs the .ts sources directly via Node's built-in
// TypeScript type-stripping with NO compile step, so no compiled
// `referenceData.js` file ever exists on disk — only `referenceData.ts`
// does. Node's ESM resolver does not fall back from a `.js` specifier to a
// sibling `.ts` file on its own (verified empirically: this is a hard
// requirement, not a Node bug), so a direct `node --test` run would fail to
// resolve `./referenceData.js` even though `./referenceData.ts` is right
// there.
//
// This hook bridges exactly that gap for local test runs: when a `.js`
// specifier fails to resolve, it retries the identical path with a `.ts`
// extension instead. It changes nothing about production behaviour (Vercel
// never loads this file) and nothing about the checksum/validation logic —
// it only teaches the local Node process how to find the TypeScript source
// that the compiled output would otherwise occupy.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.js') && specifier.startsWith('.')) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
        return nextResolve(specifier.slice(0, -'.js'.length) + '.ts', context);
      }
      throw err;
    }
  }
  return nextResolve(specifier, context);
}

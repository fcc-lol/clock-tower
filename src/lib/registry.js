// The library of visualizations: every .js file directly in src/visuals/ is
// one (its file name is its id). A file whose name starts with "_" is left out
// of the rotation and the gallery, which is how to park a draft; it can still
// be opened by id. Each is loaded only when it is shown.

const loaders = import.meta.glob("../visuals/*.js");
const idOf = (path) => path.slice(path.lastIndexOf("/") + 1, -3);

// The pieces in the rotation.
export const IDS = Object.keys(loaders)
  .map(idOf)
  .filter((id) => !id.startsWith("_"))
  .sort();

// Resolves to the module's default export, or rejects if there is no such piece.
export async function loadVisual(id) {
  const loader = loaders[`../visuals/${id}.js`];
  if (!loader) throw new Error(`no visualization called "${id}"`);
  const mod = (await loader()).default;
  if (!mod || typeof mod.mount !== "function") throw new Error(`"${id}" has no mount()`);
  return mod;
}

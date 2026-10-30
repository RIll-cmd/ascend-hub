// `vinext start` runs the Worker build in Node, where `cloudflare:workers` does not exist.
// The build imports it only for optional tracing, which an empty module turns off.
export async function resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export {}", shortCircuit: true };
  return next(specifier, context);
}

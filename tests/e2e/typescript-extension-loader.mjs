export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/u.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Let Node report the original unresolved specifier when it is not a TypeScript module.
    }
  }
  return nextResolve(specifier, context);
}

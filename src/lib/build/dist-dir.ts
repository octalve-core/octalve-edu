// The folder `next build` writes to. A production build can be given its own folder (NEXT_DIST_DIR=.next-walk), so a walkthrough can be recorded against a build that a `next dev` or another
// build on the same checkout cannot overwrite. Unset or empty: undefined, and Next uses `.next` as before. Only a plain folder name inside the project is accepted (no path, no `..`),
// because Next would otherwise write outside it; anything else stops the build with a sentence that says what to write.
export function distDirFrom(value: string | undefined): string | undefined {
  const dir = value?.trim();
  if (dir === undefined || dir === "") return undefined;
  if (!/^\.?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(dir) || dir.includes(".."))
    throw new Error(`NEXT_DIST_DIR must be a plain folder name such as ".next-walk", not "${dir}".`);
  return dir;
}

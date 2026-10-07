/** SQLite BINARY compares the stored UTF-8 bytes, including supplementary scalars. */
export function compareBinary(left: string, right: string) {
    const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
}
export function compareTreePages(
    a: { id: string; treePosition?: string | null },
    b: { id: string; treePosition?: string | null },
) {
    const left = a.treePosition ?? null, right = b.treePosition ?? null;
    if (left !== right) {
        if (left === null) return -1;
        if (right === null) return 1;
        return compareBinary(left, right);
    }
    return compareBinary(a.id, b.id);
}

export type FileNode = { name: string; path: string; children?: FileNode[] };

// Turns git's flat "a/b/c.js" paths into a tree: folders first, then files, each by name.
export function fileTree(paths: string[]): FileNode[] {
  const root: FileNode = { name: "", path: "", children: [] };
  for (const path of paths) {
    let node = root;
    const parts = path.split("/");
    parts.forEach((name, i) => {
      const last = i === parts.length - 1;
      let child = node.children!.find(c => c.name === name && Boolean(c.children) === !last);
      if (!child) {
        child = last ? { name, path } : { name, path: parts.slice(0, i + 1).join("/"), children: [] };
        node.children!.push(child);
      }
      node = child;
    });
  }
  const sort = (nodes: FileNode[]): FileNode[] => nodes
    .sort((a, b) => Number(Boolean(b.children)) - Number(Boolean(a.children)) || a.name.localeCompare(b.name))
    .map(n => (n.children ? { ...n, children: sort(n.children) } : n));
  return sort(root.children!);
}

export function formatBytes(size: number): string {
  return size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

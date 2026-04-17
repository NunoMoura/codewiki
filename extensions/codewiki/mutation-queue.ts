import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";

export async function withLockedPaths<T>(paths: string[], fn: () => Promise<T>): Promise<T> {
  const uniquePaths = [...new Set(paths.filter(Boolean))].sort();

  const run = async (index: number): Promise<T> => {
    if (index >= uniquePaths.length) return fn();
    return withFileMutationQueue(uniquePaths[index], () => run(index + 1));
  };

  return run(0);
}

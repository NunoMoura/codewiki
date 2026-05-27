/**
 * shared/lock.ts
 *
 * Minimal in-process path mutation queue used by concept use cases that write
 * generated CodeWiki state. Cross-process content proof still belongs to Git.
 */

const pathQueues = new Map<string, Promise<unknown>>();

async function withPathQueue<T>(path: string, fn: () => Promise<T>): Promise<T> {
	const key = path.trim();
	if (!key) return fn();
	const previous = pathQueues.get(key) ?? Promise.resolve();
	let release: () => void = () => {};
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	pathQueues.set(key, previous.catch(() => undefined).then(() => current));
	try {
		await previous.catch(() => undefined);
		return await fn();
	} finally {
		release();
		if (pathQueues.get(key) === current) pathQueues.delete(key);
	}
}

export async function withLockedPaths<T>(
	paths: string[],
	fn: () => Promise<T>,
): Promise<T> {
	const uniquePaths = [...new Set(paths.filter(Boolean))].sort();
	const run = async (index: number): Promise<T> => {
		if (index >= uniquePaths.length) return fn();
		return withPathQueue(uniquePaths[index], () => run(index + 1));
	};
	return run(0);
}

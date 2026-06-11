export interface InvariantCheck {
	ok: boolean;
	message: string;
}

export function invariant(check: InvariantCheck): asserts check is InvariantCheck & { ok: true } {
	if (check.ok === false) throw new Error(check.message);
}

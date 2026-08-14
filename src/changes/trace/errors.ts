interface ProtocolFailure<
	TName extends string,
	TCode extends string,
	TIdentity extends string | null,
> extends Error {
	readonly name: TName;
	readonly code: TCode;
	readonly operationId: TIdentity;
}

export function throwProtocolFailure<
	TName extends string,
	TCode extends string,
	TIdentity extends string | null,
>(
	name: TName,
	code: TCode,
	operationId: TIdentity,
	message: string,
): never {
	const error = new Error(`${code}: ${message}`) as ProtocolFailure<
		TName,
		TCode,
		TIdentity
	>;
	Object.defineProperties(error, {
		name: {value: name, enumerable: true},
		code: {value: code, enumerable: true},
		operationId: {value: operationId, enumerable: true},
	});
	throw error;
}

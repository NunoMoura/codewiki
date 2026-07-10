const ANSI_PATTERN =
	/\x1B(?:\[[0-?]*[ -/]*[@-~]|\][\s\S]*?(?:\x07|\x1B\\)|[P_^][\s\S]*?\x1B\\|[@-Z\\-_])/g;
const WIDE_CODE_POINT_RANGES: ReadonlyArray<readonly [number, number]> = [
	[0x1100, 0x115f],
	[0x2e80, 0xa4cf],
	[0xac00, 0xd7a3],
	[0xf900, 0xfaff],
	[0xfe10, 0xfe19],
	[0xfe30, 0xfe6f],
	[0xff00, 0xff60],
	[0xffe0, 0xffe6],
	[0x1f300, 0x1f64f],
	[0x1f900, 0x1f9ff],
	[0x20000, 0x3fffd],
];

export function stripAnsi(value: string): string {
	return value.replace(ANSI_PATTERN, "");
}

export function visibleWidth(value: string): number {
	let width = 0;
	for (let index = 0; index < value.length; ) {
		const sequence = readAnsiSequence(value, index);
		if (sequence) {
			index += sequence.length;
			continue;
		}
		const code = value.codePointAt(index) ?? 0;
		const character = String.fromCodePoint(code);
		width += characterWidth(code);
		index += character.length;
	}
	return width;
}

export function truncateToWidth(
	value: string,
	width: number | undefined,
	ellipsis = "…",
): string {
	if (typeof width !== "number" || !Number.isFinite(width)) return value;
	const safeWidth = Math.max(0, Math.floor(width));
	if (safeWidth === 0) return "";
	if (visibleWidth(value) <= safeWidth) return value;
	const suffixWidth = visibleWidth(ellipsis);
	const suffix = suffixWidth <= safeWidth ? ellipsis : "";
	const targetWidth = Math.max(0, safeWidth - visibleWidth(suffix));
	let used = 0;
	let output = "";
	for (let index = 0; index < value.length; ) {
		const sequence = readAnsiSequence(value, index);
		if (sequence) {
			output += sequence;
			index += sequence.length;
			continue;
		}
		const code = value.codePointAt(index) ?? 0;
		const character = String.fromCodePoint(code);
		const cellWidth = characterWidth(code);
		if (used + cellWidth > targetWidth) break;
		output += character;
		used += cellWidth;
		index += character.length;
	}
	return `${output}${suffix}`;
}

export function padRightToWidth(
	value: string,
	width: number,
	fill = " ",
): string {
	const length = visibleWidth(value);
	if (length >= width) return truncateToWidth(value, width);
	return `${value}${fill.repeat(Math.max(0, width - length))}`;
}

export function wrapToWidth(value: string, width: number): string[] {
	const safeWidth = Math.max(1, Math.floor(width));
	const words = value.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [""];
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		if (visibleWidth(word) > safeWidth) {
			if (current) {
				lines.push(current);
				current = "";
			}
			lines.push(...splitLongWord(word, safeWidth));
			continue;
		}
		const candidate = current ? `${current} ${word}` : word;
		if (visibleWidth(candidate) > safeWidth) {
			if (current) lines.push(current);
			current = word;
		} else {
			current = candidate;
		}
	}
	if (current) lines.push(current);
	return lines.length ? lines : [""];
}

function splitLongWord(value: string, width: number): string[] {
	const lines: string[] = [];
	let current = "";
	let used = 0;
	for (let index = 0; index < value.length; ) {
		const sequence = readAnsiSequence(value, index);
		if (sequence) {
			current += sequence;
			index += sequence.length;
			continue;
		}
		const code = value.codePointAt(index) ?? 0;
		const character = String.fromCodePoint(code);
		const cellWidth = characterWidth(code);
		if (cellWidth > width) {
			if (current) {
				lines.push(current);
				current = "";
				used = 0;
			}
			lines.push(truncateToWidth(character, width));
			index += character.length;
			continue;
		}
		if (used + cellWidth > width && current) {
			lines.push(current);
			current = "";
			used = 0;
		}
		current += character;
		used += cellWidth;
		index += character.length;
	}
	if (current) lines.push(current);
	return lines.length ? lines : [""];
}

function readAnsiSequence(value: string, index: number): string | undefined {
	if (value.charCodeAt(index) !== 0x1b) return undefined;
	const next = value[index + 1];
	if (!next) return value.slice(index);
	if (next === "[") {
		for (let cursor = index + 2; cursor < value.length; cursor++) {
			const code = value.charCodeAt(cursor);
			if (code >= 0x40 && code <= 0x7e) return value.slice(index, cursor + 1);
		}
		return value.slice(index);
	}
	if (next === "]") return readTerminatedEscape(value, index, index + 2, true);
	if (next === "P" || next === "_" || next === "^") {
		return readTerminatedEscape(value, index, index + 2, false);
	}
	return value.slice(index, Math.min(value.length, index + 2));
}

function readTerminatedEscape(
	value: string,
	start: number,
	cursor: number,
	allowBell: boolean,
): string {
	for (let index = cursor; index < value.length; index++) {
		if (allowBell && value.charCodeAt(index) === 0x07) {
			return value.slice(start, index + 1);
		}
		if (value.charCodeAt(index) === 0x1b && value[index + 1] === "\\") {
			return value.slice(start, index + 2);
		}
	}
	return value.slice(start);
}

function characterWidth(code: number): number {
	if (code === 0) return 0;
	if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0;
	if (code === 0x200d) return 0;
	if (isCombiningMark(code)) return 0;
	if (isWideCodePoint(code)) return 2;
	return 1;
}

function isCombiningMark(code: number): boolean {
	return (
		(code >= 0x0300 && code <= 0x036f) ||
		(code >= 0x1ab0 && code <= 0x1aff) ||
		(code >= 0x1dc0 && code <= 0x1dff) ||
		(code >= 0x20d0 && code <= 0x20ff) ||
		(code >= 0xfe00 && code <= 0xfe0f) ||
		(code >= 0xfe20 && code <= 0xfe2f)
	);
}

function isWideCodePoint(code: number): boolean {
	if (code === 0x2329 || code === 0x232a) return true;
	if (code === 0x303f) return false;
	return WIDE_CODE_POINT_RANGES.some(
		([start, end]) => code >= start && code <= end,
	);
}

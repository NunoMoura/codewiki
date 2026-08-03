import {XMLParser} from "fast-xml-parser";
import {SyntaxValidator} from "fast-xml-validator";

import {objectValue} from "./shared.ts";

export function parseSafeXmlArtifact(
	...input: [
		Uint8Array,
		{
			readonly label: string;
			readonly arrayElements: ReadonlySet<string>;
			readonly maximumNesting: number;
		},
	]
): unknown {
	const [bytes, options] = input;
	let xml: string;
	try {
		xml = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
	} catch {
		throw new Error(`${options.label} artifact must be valid UTF-8 XML.`);
	}
	const withoutDeclaration = xml.replace(
		/^\uFEFF?\s*<\?xml\s[^?]*\?>/iu,
		"",
	);
	if (/<!DOCTYPE\b|<!ENTITY\b|<\?/iu.test(withoutDeclaration)) {
		throw new Error(
			`${options.label} artifact cannot contain DTD, entity, or processing declarations.`,
		);
	}
	try {
		SyntaxValidator.validate(xml, {
			invalidCharSequence: {comment: true, tagValue: true, attrLt: true},
		});
	} catch (error) {
		const line = xmlErrorLine(error);
		throw new Error(
			`${options.label} artifact is not valid XML${line === undefined ? "." : ` at line ${line}.`}`,
		);
	}
	try {
		return new XMLParser({
			ignoreAttributes: false,
			attributesGroupName: "$",
			attributeNamePrefix: "",
			parseTagValue: false,
			parseAttributeValue: false,
			trimValues: false,
			processEntities: false,
			ignoreDeclaration: true,
			ignorePiTags: true,
			maxNestedTags: options.maximumNesting,
			isArray: (tagName) => options.arrayElements.has(tagName),
		}).parse(xml);
	} catch {
		throw new Error(`${options.label} artifact could not be parsed safely.`);
	}
}

export function xmlElementAttributes(
	...input: [Record<string, unknown>, string]
): Record<string, unknown> {
	const [value, label] = input;
	if (value.$ === undefined) return {};
	return objectValue(value.$, `${label} attributes`);
}

export function xmlElementObject(
	...input: [unknown, string]
): Record<string, unknown> {
	const [value, label] = input;
	if (value === undefined || value === "") return {};
	return objectValue(value, label);
}

export function xmlObjectArray(
	...input: [unknown, string]
): Record<string, unknown>[] {
	const [value, label] = input;
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return Array.from(value.entries(), ([index, entry]) =>
		objectValue(entry, `${label}[${index}]`),
	);
}

function xmlErrorLine(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null || !("line" in error)) {
		return undefined;
	}
	return Number.isSafeInteger(error.line) && (error.line as number) > 0
		? (error.line as number)
		: undefined;
}

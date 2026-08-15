export type ImplementationArtifactKind =
	| "source"
	| "test"
	| "docs"
	| "kb"
	| "trace"
	| "config"
	| "package"
	| "generated"
	| "vendor"
	| "unknown";

export type ImplementationReviewOwner =
	| "implementation"
	| "decision"
	| "planning"
	| "trace"
	| "none";

export type ImplementationLanguage =
	| "typescript"
	| "javascript"
	| "python"
	| "go"
	| "rust"
	| "shell"
	| "markdown"
	| "json"
	| "yaml"
	| "toml"
	| "html"
	| "css"
	| "php"
	| "ruby"
	| "java"
	| "kotlin"
	| "csharp"
	| "cpp"
	| "c"
	| "unknown";

export interface ImplementationArtifactClassification {
	path: string;
	kind: ImplementationArtifactKind;
	language: ImplementationLanguage;
	isCodeBearing: boolean;
	reviewOwner: ImplementationReviewOwner;
	reasons: string[];
}

const generatedOrVendorSegments = new Map<string, ImplementationArtifactKind>([
	[".git", "generated"],
	["coverage", "generated"],
	["dist", "generated"],
	["build", "generated"],
	["out", "generated"],
	["node_modules", "vendor"],
	["vendor", "vendor"],
]);

const packageFiles = new Set([
	"package.json",
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"Cargo.toml",
	"Cargo.lock",
	"go.mod",
	"go.sum",
	"pyproject.toml",
	"requirements.txt",
	"poetry.lock",
]);

const configNames = new Set([
	"tsconfig.json",
	"eslint.config.js",
	"biome.json",
	"ruff.toml",
	"mypy.ini",
	"pytest.ini",
	"Makefile",
	"Dockerfile",
]);

export function classifyImplementationArtifact(
	path: string,
): ImplementationArtifactClassification {
	const normalized = normalizeArtifactPath(path);
	const segments = normalized.split("/").filter(Boolean);
	const filename = segments.at(-1) || normalized;
	const generatedOrVendor = generatedOrVendorKind(segments);
	if (generatedOrVendor) {
		return classification({
			path: normalized,
			kind: generatedOrVendor,
			language: languageForPath(filename),
			isCodeBearing: false,
			reviewOwner: "none",
			reasons: [
				`Path is under ${generatedOrVendor} output or third-party code.`,
			],
		});
	}
	if (normalized.startsWith(".codewiki/traces/") || /^TRACE-/.test(filename)) {
		return classification({
			path: normalized,
			kind: "trace",
			language: "json",
			isCodeBearing: false,
			reviewOwner: "trace",
			reasons: [
				"Trace artifacts are append-only workflow records, not code review targets.",
			],
		});
	}
	if (normalized.startsWith(".codewiki/kb/")) {
		return classification({
			path: normalized,
			kind: "kb",
			language: languageForPath(filename),
			isCodeBearing: false,
			reviewOwner: "decision",
			reasons: [
				"KB artifacts are semantic source truth owned by loop contracts.",
			],
		});
	}
	if (isTestPath(normalized, filename)) {
		return classification({
			path: normalized,
			kind: "test",
			language: languageForPath(filename),
			isCodeBearing: isSourceLanguage(languageForPath(filename)),
			reviewOwner: "implementation",
			reasons: [
				"Test artifacts are implementation evidence for changed behavior.",
			],
		});
	}
	if (isDocsPath(normalized, filename)) {
		return classification({
			path: normalized,
			kind: "docs",
			language: languageForPath(filename),
			isCodeBearing: false,
			reviewOwner: "implementation",
			reasons: [
				"Documentation can be an implementation artifact when planned work changes docs.",
			],
		});
	}
	if (packageFiles.has(filename)) {
		return classification({
			path: normalized,
			kind: "package",
			language: languageForPath(filename),
			isCodeBearing: false,
			reviewOwner: "implementation",
			reasons: [
				"Package and dependency manifests affect implementation verification.",
			],
		});
	}
	if (configNames.has(filename) || normalized.startsWith(".github/")) {
		return classification({
			path: normalized,
			kind: "config",
			language: languageForPath(filename),
			isCodeBearing: isSourceLanguage(languageForPath(filename)),
			reviewOwner: "implementation",
			reasons: [
				"Configuration changes can alter implementation checks or runtime behavior.",
			],
		});
	}
	const language = languageForPath(filename);
	if (isSourceLanguage(language)) {
		return classification({
			path: normalized,
			kind: "source",
			language,
			isCodeBearing: true,
			reviewOwner: "implementation",
			reasons: ["Source artifact is code-bearing implementation surface."],
		});
	}
	return classification({
		path: normalized,
		kind: "unknown",
		language,
		isCodeBearing: false,
		reviewOwner: "none",
		reasons: ["Artifact kind is unknown to the baseline review classifier."],
	});
}

export function isImplementationOwnedArtifact(path: string): boolean {
	return classifyImplementationArtifact(path).reviewOwner === "implementation";
}

export function isCodeBearingArtifact(path: string): boolean {
	return classifyImplementationArtifact(path).isCodeBearing;
}

export function languageForPath(path: string): ImplementationLanguage {
	const filename = path.split("/").at(-1) || path;
	const lower = filename.toLowerCase();
	if (/\.tsx?$/.test(lower) || lower === "tsconfig.json") return "typescript";
	if (/\.(jsx?|mjs|cjs)$/.test(lower) || lower === "eslint.config.js") {
		return "javascript";
	}
	if (/\.py$/.test(lower) || lower === "pyproject.toml") return "python";
	if (/\.go$/.test(lower) || ["go.mod", "go.sum"].includes(lower)) return "go";
	if (/\.rs$/.test(lower) || ["cargo.toml", "cargo.lock"].includes(lower)) {
		return "rust";
	}
	if (/\.(sh|bash|zsh|fish|ps1)$/.test(lower)) return "shell";
	if (/\.mdx?$/.test(lower) || ["readme.md", "changelog.md"].includes(lower)) {
		return "markdown";
	}
	if (/\.json$/.test(lower)) return "json";
	if (/\.(ya?ml)$/.test(lower)) return "yaml";
	if (/\.toml$/.test(lower)) return "toml";
	if (/\.html?$/.test(lower)) return "html";
	if (/\.css$/.test(lower)) return "css";
	if (/\.php$/.test(lower)) return "php";
	if (/\.rb$/.test(lower)) return "ruby";
	if (/\.java$/.test(lower)) return "java";
	if (/\.kt$/.test(lower)) return "kotlin";
	if (/\.cs$/.test(lower)) return "csharp";
	if (/\.(cc|cpp|cxx|hpp|hxx)$/.test(lower)) return "cpp";
	if (/\.(c|h)$/.test(lower)) return "c";
	return "unknown";
}

function classification(
	value: ImplementationArtifactClassification,
): ImplementationArtifactClassification {
	return {
		...value,
		reasons: value.reasons.filter(Boolean),
	};
}

function normalizeArtifactPath(path: string): string {
	return path.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function generatedOrVendorKind(
	segments: string[],
): ImplementationArtifactKind | undefined {
	for (const segment of segments) {
		const kind = generatedOrVendorSegments.get(segment);
		if (kind) return kind;
	}
	return undefined;
}

function isTestPath(path: string, filename: string): boolean {
	return (
		path.startsWith("tests/") ||
		path.includes("/tests/") ||
		/[._-](test|spec)\.[cm]?[jt]sx?$/.test(filename) ||
		/[._-](test|spec)\.py$/.test(filename) ||
		filename.endsWith("_test.go")
	);
}

function isDocsPath(path: string, filename: string): boolean {
	return (
		path.startsWith("docs/") ||
		["README.md", "CHANGELOG.md", "LICENSE"].includes(filename) ||
		/\.(md|mdx|rst|adoc|txt)$/i.test(filename)
	);
}

function isSourceLanguage(language: ImplementationLanguage): boolean {
	return ![
		"unknown",
		"markdown",
		"json",
		"yaml",
		"toml",
		"html",
		"css",
	].includes(language);
}

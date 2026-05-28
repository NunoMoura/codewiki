import type { SessionStore } from "../shared/ports.ts";
import type { buildCodewikiResumeContext } from "../state/resume-context.ts";
import type { buildValidationPreflight } from "../validation/report.ts";

export interface RuntimeSessionBoundaryPort {
	requestContextRefresh?: (request: {
		reason: string;
		taskId?: string | null;
		followUpIntent?: string | null;
		requestedAt?: string;
	}) => void | Promise<void>;
}

export interface CodewikiRuntimePorts {
	sessionStore?: SessionStore;
	sessionBoundary?: RuntimeSessionBoundaryPort;
	resumeContextBuilder?: typeof buildCodewikiResumeContext;
	validationPreflightBuilder?: typeof buildValidationPreflight;
}

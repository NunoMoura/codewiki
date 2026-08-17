import type {
	ClientProjectServerActorContext,
	ClientProjectServerRequestContext,
	ClientProjectServerTransportContext,
} from "../../protocol/client-project-server.ts";
import type {Sha256Digest} from "../../utils/canonical-json.ts";

export const PROJECT_SERVER_SESSION_PROTOCOL = Object.freeze({
	id: "codewiki.project-server-session",
	version: "1.0.0",
} as const);

export interface ProjectServerSessionProjectBinding {
	readonly projectId: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly projectServerRouteRef: string;
}

export interface ProjectServerSessionBinding {
	readonly actor: ClientProjectServerActorContext;
	readonly client: ClientProjectServerTransportContext;
	readonly project: ProjectServerSessionProjectBinding;
}

export interface ProjectServerSessionRecord extends ProjectServerSessionBinding {
	readonly protocolId: typeof PROJECT_SERVER_SESSION_PROTOCOL.id;
	readonly protocolVersion: typeof PROJECT_SERVER_SESSION_PROTOCOL.version;
	readonly sessionId: string;
	readonly generation: number;
	readonly credentialDigest: Sha256Digest;
	readonly status: "active" | "revoked";
	readonly issuedAt: string;
	readonly updatedAt: string;
	readonly expiresAt: string;
}

export interface OpenedProjectServerSession {
	readonly session: ProjectServerSessionRecord;
	/** One-time bearer credential. Only its digest belongs in session state. */
	readonly credential: string;
}

export interface ProjectServerEndpointRequest {
	readonly endpointId: string;
	readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	readonly repositoryIdentity: Sha256Digest;
}

export interface ProjectServerEndpointAuthorizationContext extends ProjectServerSessionBinding {
	readonly sessionId: string;
	readonly sessionGeneration: number;
	readonly endpoint: ProjectServerEndpointRequest;
}

export interface ProjectServerEndpointAuthorizationAdapter {
	readonly adapterId: string;
	authorize(input: ProjectServerEndpointAuthorizationContext): boolean | Promise<boolean>;
}

export interface ProjectServerEndpointAuthorization extends ProjectServerEndpointAuthorizationContext {
	readonly authorizationAdapterId: string;
	readonly requestContext: ClientProjectServerRequestContext;
}

import type {
	ClientServerActorContext,
	ClientServerRequestContext,
	ClientServerTransportContext,
} from "../../protocol/client-server.ts";
import type {Sha256Digest} from "../../utils/canonical-json.ts";

export const SERVER_SESSION_PROTOCOL = Object.freeze({
	id: "codewiki.server-session",
	version: "1.0.0",
} as const);

export interface ServerSessionProjectBinding {
	readonly projectId: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly runtimeRouteRef: string;
}

export interface ServerSessionBinding {
	readonly actor: ClientServerActorContext;
	readonly client: ClientServerTransportContext;
	readonly project: ServerSessionProjectBinding;
}

export interface ServerSessionRecord extends ServerSessionBinding {
	readonly protocolId: typeof SERVER_SESSION_PROTOCOL.id;
	readonly protocolVersion: typeof SERVER_SESSION_PROTOCOL.version;
	readonly sessionId: string;
	readonly generation: number;
	readonly credentialDigest: Sha256Digest;
	readonly status: "active" | "revoked";
	readonly issuedAt: string;
	readonly updatedAt: string;
	readonly expiresAt: string;
}

export interface OpenedServerSession {
	readonly session: ServerSessionRecord;
	/** One-time bearer credential. Only its digest belongs in session state. */
	readonly credential: string;
}

export interface ServerEndpointRequest {
	readonly endpointId: string;
	readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	readonly repositoryIdentity: Sha256Digest;
}

export interface ServerEndpointAuthorizationContext extends ServerSessionBinding {
	readonly sessionId: string;
	readonly sessionGeneration: number;
	readonly endpoint: ServerEndpointRequest;
}

export interface ServerEndpointAuthorizationAdapter {
	readonly adapterId: string;
	authorize(input: ServerEndpointAuthorizationContext): boolean | Promise<boolean>;
}

export interface ServerEndpointAuthorization extends ServerEndpointAuthorizationContext {
	readonly authorizationAdapterId: string;
	readonly requestContext: ClientServerRequestContext;
}

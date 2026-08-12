export class DashboardControlError extends Error {
	readonly status: 400 | 403 | 409;

	constructor(message: string, status: 400 | 403 | 409) {
		super(message);
		this.name = "DashboardControlError";
		this.status = status;
	}
}

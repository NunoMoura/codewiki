export interface RetentionPolicy {
	archiveBefore?: string;
	keepActive: boolean;
}

export const defaultRetentionPolicy: RetentionPolicy = { keepActive: true };

export class CliUsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CliUsageError";
	}
}

export class InputFileReadError extends Error {
	file: string;

	constructor(file: string) {
		super(`Input file "${file}" could not be read.`);
		this.name = "InputFileReadError";
		this.file = file;
	}
}

export class InputFileParseError extends Error {
	file: string;

	constructor(file: string) {
		super(`Input file "${file}" contains invalid JSON.`);
		this.name = "InputFileParseError";
		this.file = file;
	}
}

export class InvalidStoredStateError extends Error {
	store: "credentials" | "data";

	constructor(store: "credentials" | "data") {
		super(
			store === "credentials"
				? 'Stored credentials are invalid. Run "meridian auth logout" to clear local state.'
				: 'Local data store is invalid. Remove "~/.meridian/data.json" or re-run the workflow to rebuild it.',
		);
		this.name = "InvalidStoredStateError";
		this.store = store;
	}
}

export class AuthRefreshError extends Error {
	constructor() {
		super(
			'Failed to refresh stored credentials. Check MERIDIAN_AUTH_ISSUER or run "meridian auth login" again.',
		);
		this.name = "AuthRefreshError";
	}
}

export class AuthDeviceFlowError extends Error {
	constructor(
		message = "Authentication service is unavailable. Check MERIDIAN_AUTH_ISSUER and try again.",
	) {
		super(message);
		this.name = "AuthDeviceFlowError";
	}
}

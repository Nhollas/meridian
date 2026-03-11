export function createUnsignedJwt(payload: Record<string, unknown>) {
	const header = Buffer.from(
		JSON.stringify({ alg: "none", typ: "JWT" }),
	).toString("base64url");
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

	return `${header}.${body}.`;
}

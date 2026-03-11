import { describe, expect, it } from "vitest";
import {
	DEFAULT_AUTH_CLIENT_ID,
	DEFAULT_AUTH_ISSUER,
	getAuthConfig,
} from "../../../src/auth/session.js";

describe("auth session config", () => {
	it("uses the official Meridian auth defaults when no overrides are set", () => {
		expect(getAuthConfig({})).toEqual({
			issuer: DEFAULT_AUTH_ISSUER,
			clientId: DEFAULT_AUTH_CLIENT_ID,
		});
	});

	it("uses environment overrides when they are set", () => {
		expect(
			getAuthConfig({
				MERIDIAN_AUTH_ISSUER: "http://localhost:18091/realms/meridian",
				MERIDIAN_AUTH_CLIENT_ID: "local-meridian-cli",
			}),
		).toEqual({
			issuer: "http://localhost:18091/realms/meridian",
			clientId: "local-meridian-cli",
		});
	});

	it("falls back to defaults when overrides are blank", () => {
		expect(
			getAuthConfig({
				MERIDIAN_AUTH_ISSUER: "   ",
				MERIDIAN_AUTH_CLIENT_ID: "",
			}),
		).toEqual({
			issuer: DEFAULT_AUTH_ISSUER,
			clientId: DEFAULT_AUTH_CLIENT_ID,
		});
	});
});

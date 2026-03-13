import { join } from "node:path";
import { z } from "zod";
import { InvalidStoredStateError } from "@/errors";
import type { FileSystem } from "@/runtime";

const storedCredentialsSchema = z.object({
	accessToken: z.string(),
	expiresAt: z.string(),
	idToken: z.string().optional(),
	refreshToken: z.string().optional(),
	user: z.string(),
});

export type StoredCredentials = z.infer<typeof storedCredentialsSchema>;

function getCredentialsPath(homeDirectory: string) {
	return join(homeDirectory, ".meridian", "credentials.json");
}

export async function readCredentials(
	fileSystem: FileSystem,
	homeDirectory: string,
): Promise<StoredCredentials | null> {
	try {
		const contents = await fileSystem.readFile(
			getCredentialsPath(homeDirectory),
			"utf8",
		);
		const payload = JSON.parse(contents) as unknown;
		const parsed = storedCredentialsSchema.safeParse(payload);
		if (!parsed.success) {
			throw new InvalidStoredStateError("credentials");
		}
		return parsed.data;
	} catch (error) {
		const errorCode = (error as NodeJS.ErrnoException).code;
		if (errorCode === "ENOENT") {
			return null;
		}

		if (error instanceof SyntaxError || errorCode === "EISDIR") {
			throw new InvalidStoredStateError("credentials");
		}

		throw error;
	}
}

export async function writeCredentials(
	fileSystem: FileSystem,
	homeDirectory: string,
	credentials: StoredCredentials,
) {
	await fileSystem.mkdir(join(homeDirectory, ".meridian"), { recursive: true });
	await fileSystem.writeFile(
		getCredentialsPath(homeDirectory),
		JSON.stringify(credentials, null, 2),
	);
}

export async function deleteCredentials(
	fileSystem: FileSystem,
	homeDirectory: string,
) {
	try {
		await fileSystem.unlink(getCredentialsPath(homeDirectory));
	} catch (error) {
		const errorCode = (error as NodeJS.ErrnoException).code;
		if (errorCode === "ENOENT") {
			return;
		}

		if (errorCode === "EISDIR" || errorCode === "EPERM") {
			await fileSystem.rm(getCredentialsPath(homeDirectory), {
				force: true,
				recursive: true,
			});
			return;
		}

		throw error;
	}
}

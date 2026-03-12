import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

function shouldEnableEnvProxy(env: NodeJS.ProcessEnv) {
	return Boolean(
		env["HTTP_PROXY"] ??
			env["HTTPS_PROXY"] ??
			env["http_proxy"] ??
			env["https_proxy"],
	);
}

let proxyConfigured = false;

export function configureProcessNetworking(env: NodeJS.ProcessEnv) {
	if (proxyConfigured || !shouldEnableEnvProxy(env)) {
		return;
	}

	setGlobalDispatcher(new EnvHttpProxyAgent());
	proxyConfigured = true;
}

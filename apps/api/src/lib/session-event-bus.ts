import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";

type Subscriber = (event: RuntimeEventEnvelope) => void;

type SubscribeOptions = {
	lastEventId?: string | undefined;
};

const DEFAULT_MAX_HISTORY_PER_SESSION = 1000;

export type SessionEventBus = ReturnType<typeof createSessionEventBus>;

export function createSessionEventBus({
	maxHistoryPerSession = DEFAULT_MAX_HISTORY_PER_SESSION,
}: {
	maxHistoryPerSession?: number | undefined;
} = {}) {
	const subscribers = new Map<string, Set<Subscriber>>();
	const eventHistory = new Map<string, RuntimeEventEnvelope[]>();

	function getOrCreateSet<T>(map: Map<string, Set<T>>, key: string): Set<T> {
		let set = map.get(key);
		if (!set) {
			set = new Set();
			map.set(key, set);
		}
		return set;
	}

	function getOrCreateArray<T>(map: Map<string, T[]>, key: string): T[] {
		let arr = map.get(key);
		if (!arr) {
			arr = [];
			map.set(key, arr);
		}
		return arr;
	}

	return {
		publish(sessionId: string, event: RuntimeEventEnvelope): void {
			const history = getOrCreateArray(eventHistory, sessionId);
			history.push(event);
			if (history.length > maxHistoryPerSession) {
				history.splice(0, history.length - maxHistoryPerSession);
			}

			const sessionSubscribers = subscribers.get(sessionId);
			if (!sessionSubscribers) return;
			for (const subscriber of sessionSubscribers) {
				subscriber(event);
			}
		},

		subscribe(
			sessionId: string,
			options?: SubscribeOptions,
		): ReadableStream<RuntimeEventEnvelope> {
			return new ReadableStream<RuntimeEventEnvelope>({
				start(controller) {
					if (options?.lastEventId) {
						const history = eventHistory.get(sessionId) ?? [];
						const index = history.findIndex(
							(e) => e.id === options.lastEventId,
						);
						if (index !== -1) {
							for (const event of history.slice(index + 1)) {
								controller.enqueue(event);
							}
						}
					}

					const subscriber: Subscriber = (event) => {
						controller.enqueue(event);
					};

					getOrCreateSet(subscribers, sessionId).add(subscriber);
				},
			});
		},
	};
}

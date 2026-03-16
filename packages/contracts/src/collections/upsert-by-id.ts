/**
 * Upserts an item into an array by `id`. If an item with the same `id` exists,
 * it is shallow-merged with the new item. Otherwise the new item is appended.
 *
 * Returns a new array — the original is not mutated.
 */
export function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
	const existingIndex = items.findIndex((item) => item.id === next.id);

	if (existingIndex === -1) {
		return [...items, next];
	}

	return items.map((item, index) =>
		index === existingIndex ? { ...item, ...next } : item,
	);
}

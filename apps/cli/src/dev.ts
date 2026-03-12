// Dev entry point
// .env is loaded via --env-file in the dev script

export {};

const { main } = await import("./cli");
await main();

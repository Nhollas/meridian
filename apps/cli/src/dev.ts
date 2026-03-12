// Dev entry point
// .env is loaded via --env-file in the dev script

const { main } = await import("./cli.js");
await main();

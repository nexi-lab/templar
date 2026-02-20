import { main } from "./cli.js";

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

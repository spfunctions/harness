#!/usr/bin/env node
// Published bin entry for @spfunctions/harness — invokes the compiled CLI.
// The handwritten bin/sparkco.ts wrapper used #!/usr/bin/env npx tsx for dev;
// this file is what npm publishes and what the `sparkco` command actually runs.
import { program } from "./index.js";

program.parse();

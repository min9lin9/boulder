#!/usr/bin/env bun

import { main } from "../src/cli";

await main(Bun.argv.slice(2));

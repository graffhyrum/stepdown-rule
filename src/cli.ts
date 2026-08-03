#!/usr/bin/env bun
import "./register-default-rules";
import { createProgram } from "./cli-program";

await createProgram().parseAsync(process.argv);

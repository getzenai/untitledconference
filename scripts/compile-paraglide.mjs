#!/usr/bin/env node
import { compile } from '@inlang/paraglide-js';
import { paraglideCompilerOptions } from '../paraglide.config.mjs';

await compile(paraglideCompilerOptions);

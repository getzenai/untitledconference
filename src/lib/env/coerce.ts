/**
 * Pure coercion helpers shared by the server and public environment registries.
 *
 * Environment variables only ever arrive as strings or `undefined`. A variable
 * that is present but blank ("") is treated as absent so defaults apply, which
 * matches how call sites historically used `env.X || fallback`.
 *
 * This module imports nothing environment-specific, so it is safe to use from
 * both server-only and client code.
 */
import { z } from 'zod';

export const emptyToUndefined = (v: unknown): unknown => (v === '' ? undefined : v);

/** Optional free-form string. */
export const optionalStr = () => z.preprocess(emptyToUndefined, z.string().optional());

/** Optional string with a default applied when unset/blank. */
export const strWithDefault = (fallback: string) =>
	z.preprocess(emptyToUndefined, z.string().default(fallback));

/** Required non-empty string; `message` is shown when it is missing. */
export const requiredStr = (message: string) =>
	z.preprocess(emptyToUndefined, z.string({ error: message }).min(1, { error: message }));

/**
 * Boolean from "true"/"1" (case-insensitive; anything else is false);
 * `fallback` applies when unset. Case-insensitive so the registry is a strict
 * superset of existing call sites (e.g. `value.toLowerCase() === 'true'`).
 */
export const boolWithDefault = (fallback: boolean) =>
	z.preprocess((v) => {
		const s = emptyToUndefined(v);
		if (s === undefined) return fallback;
		const normalized = String(s).toLowerCase();
		return normalized === 'true' || normalized === '1';
	}, z.boolean());

/** Lower-cased enum with a default, mirroring `.toLowerCase()` call sites. */
export const lowerEnumWithDefault = <const T extends readonly [string, ...string[]]>(
	values: T,
	fallback: T[number]
) =>
	z.preprocess((v) => {
		const s = emptyToUndefined(v);
		return s === undefined ? fallback : String(s).toLowerCase();
	}, z.enum(values));

/** Optional lower-cased enum (no default); stays `undefined` when unset. */
export const optionalLowerEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
	z.preprocess((v) => {
		const s = emptyToUndefined(v);
		return s === undefined ? undefined : String(s).toLowerCase();
	}, z.enum(values).optional());

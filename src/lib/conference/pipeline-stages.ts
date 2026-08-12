/**
 * Shared pipeline stage constants (CRM-07) — safe for client and server.
 */
export const PIPELINE_STAGES = [
	'researching',
	'identified',
	'contacted',
	'interested',
	'confirmed',
	'declined'
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
	researching: 'Researching',
	identified: 'Identified',
	contacted: 'Contacted',
	interested: 'Interested',
	confirmed: 'Confirmed',
	declined: 'Declined'
};

export function isPipelineStage(value: string): value is PipelineStage {
	return (PIPELINE_STAGES as readonly string[]).includes(value);
}

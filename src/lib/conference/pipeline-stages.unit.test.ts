import { describe, expect, it } from 'vitest';
import { isPipelineStage, PIPELINE_STAGE_LABELS, PIPELINE_STAGES } from './pipeline-stages';

describe('pipeline stages', () => {
	it('covers open stages plus terminal confirmed/declined', () => {
		expect(PIPELINE_STAGES).toEqual([
			'researching',
			'identified',
			'contacted',
			'interested',
			'confirmed',
			'declined'
		]);
		for (const stage of PIPELINE_STAGES) {
			expect(PIPELINE_STAGE_LABELS[stage]).toBeTruthy();
			expect(isPipelineStage(stage)).toBe(true);
		}
		expect(isPipelineStage('unknown')).toBe(false);
	});
});

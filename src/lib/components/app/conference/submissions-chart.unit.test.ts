/**
 * The chart's job is to be readable, and most of the ways a chart lies are
 * structural rather than visual: a value only a hover can reach, a quiet day that
 * silently vanishes from the axis, an axis top that changes shape run to run.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Chart from './submissions-chart.svelte';

const days = (counts: number[]) =>
	counts.map((count, i) => ({
		day: `2028-05-${String(i + 1).padStart(2, '0')}`,
		count
	}));

describe('submissions over time', () => {
	it('puts every day in the table, zeroes included', () => {
		const { body } = render(Chart, { props: { days: days([2, 0, 0, 3]) } });

		// Four rows, and the two silent days are rows with a zero rather than
		// missing rows. A table that only lists the busy days is the same lie as an
		// axis that only ticks them.
		expect(body.match(/<tr><td>/g) ?? []).toHaveLength(4);
		expect(body).toContain('<td>0</td>');
		expect(body).toContain('4 May');
	});

	/**
	 * The values have to be reachable without a pointer. Server-rendered output is
	 * exactly the no-JavaScript case, so what appears here is what a reader gets
	 * before — or without — any hover.
	 */
	it('states the totals without anyone hovering', () => {
		const { body } = render(Chart, { props: { days: days([2, 0, 0, 3]) } });

		expect(body).toContain('5 in the last 4 days');
		expect(body).toContain('busiest day 3');
		expect(body).toContain('aria-label="Submissions per day over the last 4 days, 5 in total"');
	});

	/** One series: the card heading names it, so a one-swatch legend is noise. */
	it('draws one series and no legend', () => {
		const { body } = render(Chart, { props: { days: days([1, 2]) } });

		expect(body.match(/stroke-chart-1/g) ?? []).toHaveLength(1);
		expect(body).not.toContain('legend');
	});

	/**
	 * The plot used to be a 640×180 viewBox with `text-[9px]` on SVG `<text>`.
	 * Those sizes are user units, so on a wide card the axis type grew with the
	 * scale and the marks read as a small drawing blown up.
	 */
	it('fills the card at the page type scale, not a scaled-up viewBox', () => {
		const { body } = render(Chart, { props: { days: days([2, 0, 0, 3]) } });

		// Axis ticks and the end dates are HTML at text-xs, same as the caption.
		expect(body).toMatch(/text-xs[^"]*tabular-nums[^>]*>4</);
		expect(body).toMatch(/text-xs">1 May</);
		expect(body).toMatch(/text-xs">4 May</);
		expect(body).not.toContain('<text');
		expect(body).not.toContain('text-[9px]');

		// Width is the card; height is a CSS size, not the viewBox aspect.
		expect(body).toMatch(/<svg[^>]*class="[^"]*\bh-48\b[^"]*\bw-full\b/);
		expect(body).toContain('preserveAspectRatio="none"');
	});

	/**
	 * A scale that ends exactly at the busiest day gives every run a different
	 * shape and puts the peak flush against the top edge.
	 */
	it('rounds the axis to a number a person reads', () => {
		// Small numbers keep a floor of 4, so a two-submission day is not a wall.
		expect(render(Chart, { props: { days: days([2]) } }).body).toContain('>4</span>');
		// 7 rounds up to 10, and the half tick stays a clean 5.
		const busy = render(Chart, { props: { days: days([7]) } }).body;
		expect(busy).toContain('>10</span>');
		expect(busy).toContain('>5</span>');
	});

	/**
	 * The one peak the readable-ladder rungs cannot serve: 5 is on the ladder, and
	 * half of 5 is 2.5 — a fraction on an axis that counts whole submissions.
	 */
	it('never puts a fraction on a counting axis', () => {
		const body = render(Chart, { props: { days: days([5]) } }).body;

		expect(body).not.toContain('2.5');
		// One rung of slack: 6, halved cleanly.
		expect(body).toContain('>6</span>');
		expect(body).toContain('>3</span>');
		// And the peak still has room above it, which was the point of rounding up
		// in the first place.
		expect(body).not.toContain('>5</span>');
	});

	it('survives a conference where nothing has come in yet', () => {
		const { body } = render(Chart, { props: { days: [] } });

		expect(body).toContain('0 in the last 0 days');
		expect(body).not.toContain('NaN');
	});
});

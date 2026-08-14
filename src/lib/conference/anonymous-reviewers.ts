/**
 * Labels every peer review as "Reviewer N" for peer-to-peer display (RV-P1-02).
 *
 * Multi-round talks used to mix real names (open rounds) with "Reviewer N"
 * (anonymised rounds) on one page — that both looks broken and undermines the
 * anonymity of any hidden round next to a named one. Numbering everyone in
 * stable review-id order is one schema for all peers.
 *
 * This is the only surface that renames a reviewer. ABS-07 hides a reviewer from
 * their peers, not from the organizer: the organizer's submission page lists the
 * same people by name and email in its assignment block, so numbering them there
 * hid nothing and only cost the organizer the link between a score and a person
 * (#416). It shows the real name and marks the round as blind instead.
 *
 * Ordered by review id so the numbering is stable — the same reviewer keeps the
 * same number across reloads, and the id itself never reaches the page.
 */
export function peerDisplayLabels(reviews: { id: number }[]): Map<number, string> {
	const ids = [...new Set(reviews.map((review) => review.id))].sort((a, b) => a - b);
	return new Map(ids.map((id, index) => [id, `Reviewer ${index + 1}`]));
}

/**
 * #866: the header Sign in is `hidden sm:inline-flex`, so at 390 it paints
 * as 0×0. A returning speaker sees only Get started free and has to scroll
 * ~6000 px to the footer Sign in.
 *
 * Unhiding it is one line. That line alone pushes Get started off the
 * screen (`right: 462` at 390). The wordmark text has to leave the row
 * under `sm`, but as `sr-only` so the home link keeps its name — the
 * goose is silent and aria-hidden, and a picture with no name is a link
 * with no name.
 *
 * Four numbers: Sign in has a box and goes to /login at 390, the page is
 * no wider than the screen, 768 and 1280 stay as they were, and the home
 * link still has a name. Flip either line back and one of the four falls.
 */
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

function pageFits() {
	cy.document().should((doc) => {
		const page = doc.documentElement;
		expect(page.scrollWidth, 'the page is no wider than the screen').to.be.at.most(
			page.clientWidth + 1
		);
	});
}

function paintedText(el: HTMLElement): string {
	const walk = (node: Node): string => {
		if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
		if (node.nodeType !== Node.ELEMENT_NODE) return '';
		const style = getComputedStyle(node as Element);
		if (style.display === 'none' || style.visibility === 'hidden') return '';
		return Array.from(node.childNodes).map(walk).join('');
	};
	return walk(el).replace(/\s+/g, ' ').trim();
}

function contentWidth(el: HTMLElement): number {
	return el.ownerDocument.documentElement.clientWidth;
}

describe('Sign in on the landing header', () => {
	it('is on the 390 header, keeps the page inside the screen, and leaves 768 and 1280 alone', () => {
		cy.viewport(PHONE.width, PHONE.height);
		cy.visit('/');
		cy.waitForHydration();

		pageFits();

		cy.get('[data-testid="landing-sign-in"]').should(($btn) => {
			const box = $btn[0].getBoundingClientRect();
			const width = contentWidth($btn[0]);
			expect(box.width, 'Sign in has a width').to.be.greaterThan(1);
			expect(box.height, 'Sign in has a height').to.be.greaterThan(1);
			expect(box.left, 'Sign in starts on screen').to.be.at.least(-1);
			expect(box.right, 'Sign in ends on screen').to.be.at.most(width + 1);
		});
		cy.get('[data-testid="landing-get-started"]').should(($btn) => {
			const box = $btn[0].getBoundingClientRect();
			const width = contentWidth($btn[0]);
			expect(box.left, 'Get started starts on screen').to.be.at.least(-1);
			expect(box.right, 'Get started ends on screen').to.be.at.most(width + 1);
		});
		cy.get('[data-testid="landing-home"]').should(($home) => {
			expect(paintedText($home[0]), 'the home link has a name at 390').to.match(
				/untitledconference/i
			);
		});

		cy.get('[data-testid="landing-sign-in"]').click();
		cy.location('pathname').should('eq', '/login');

		cy.visit('/');
		cy.waitForHydration();

		cy.viewport(TABLET.width, TABLET.height);
		pageFits();
		cy.get('[data-testid="landing-sign-in"]').should('be.visible');
		cy.get('[data-testid="landing-home"]').should(($home) => {
			const wordmark = [...$home[0].querySelectorAll('span')].find((span) =>
				span.textContent?.includes('untitledconference')
			);
			expect(wordmark, 'the wordmark is still in the header').to.not.equal(undefined);
			expect(
				wordmark!.getBoundingClientRect().width,
				'the wordmark is painted at 768'
			).to.be.greaterThan(10);
		});

		cy.viewport(DESKTOP.width, DESKTOP.height);
		pageFits();
		cy.get('[data-testid="landing-sign-in"]').should('be.visible');
		cy.get('[data-testid="landing-home"]').should(($home) => {
			const wordmark = [...$home[0].querySelectorAll('span')].find((span) =>
				span.textContent?.includes('untitledconference')
			);
			expect(wordmark, 'the wordmark is still in the header').to.not.equal(undefined);
			expect(
				wordmark!.getBoundingClientRect().width,
				'the wordmark is painted at 1280'
			).to.be.greaterThan(10);
		});
	});
});

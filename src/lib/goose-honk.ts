const HONK_FILES = [
	'/sounds/honk/honk-1.mp3',
	'/sounds/honk/honk-2.mp3',
	'/sounds/honk/honk-3.mp3',
	'/sounds/honk/honk-4.mp3',
	'/sounds/honk/honk-5.mp3',
	'/sounds/honk/honk-6.mp3',
	'/sounds/honk/honk-7.mp3',
	'/sounds/honk/honk-8.mp3'
];

// Instantiated lazily, on the first honk — not at module load, so the landing
// page never pays for audio it might never play.
export function playRandomHonk() {
	const src = HONK_FILES[Math.floor(Math.random() * HONK_FILES.length)];
	const audio = new Audio(src);
	void audio.play().catch(() => {
		// Autoplay policies can reject a play() started outside a trusted
		// gesture in some edge cases (e.g. rapid double-clicks); a missed
		// honk isn't worth surfacing to the user.
	});
}

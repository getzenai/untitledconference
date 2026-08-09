// Type for PDF.js library
type PDFJSLib = typeof import('pdfjs-dist');

let pdfjs: PDFJSLib | null = null;
let workerInitialized = false;

async function initializeWorker() {
	if (typeof window !== 'undefined' && !workerInitialized) {
		// Only import pdfjs-dist on the client side
		if (!pdfjs) {
			pdfjs = await import('pdfjs-dist');
		}

		if ('Worker' in window) {
			pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.mjs`;
			workerInitialized = true;
		}
	}
}

export async function readPdfAsText(file: File): Promise<string> {
	// Only process PDFs on the client side
	if (typeof window === 'undefined') {
		return '[PDF processing only available in browser]';
	}

	await initializeWorker();

	try {
		if (!pdfjs) {
			throw new Error('PDF.js not initialized');
		}

		const data = await file.arrayBuffer();
		const pdf = await pdfjs.getDocument({
			data,
			disableFontFace: true,
			standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`
		}).promise;

		const pageTexts: string[] = [];

		for (let i = 0; i < pdf.numPages; i++) {
			const page = await pdf.getPage(i + 1);
			const textContent = await page.getTextContent();

			// Simply concatenate all text items
			const text = textContent.items
				.map((item) => {
					if (typeof item === 'object' && item !== null && 'str' in item) {
						return (item as { str: string }).str;
					}
					return '';
				})
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim();

			pageTexts.push(text);
		}

		return pageTexts.map((text, i) => `Page ${i + 1}\n${text}`).join('\n\n');
	} catch (error) {
		console.error('Error reading PDF text:', error);
		throw error;
	}
}

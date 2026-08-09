<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Upload, Folder, Loader2, FileText } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import DOMPurify from 'dompurify';
	import mammoth from 'mammoth';
	import * as XLSX from 'xlsx';
	import { readPdfAsText } from '$lib/public/pdf';

	let { disabled = false, class: className = '' }: { disabled?: boolean; class?: string } =
		$props();

	let isProcessing = $state(false);
	let status = $state('');
	let progress = $state(0);
	let totalFiles = $state(0);
	let processedFiles = $state(0);
	let isDragging = $state(false);

	// File validation constants
	const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB as requested by user
	const ALLOWED_MIME_TYPES = [
		'text/plain',
		'text/markdown',
		'text/csv',
		'application/pdf',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
		'application/msword', // .doc (legacy)
		'application/vnd.ms-excel' // .xls (legacy)
	];
	const ALLOWED_EXTENSIONS = [
		'.txt',
		'.md',
		'.markdown',
		'.csv',
		'.pdf',
		'.doc',
		'.docx',
		'.xls',
		'.xlsx'
	];

	const dispatch = createEventDispatcher<{
		filesUploaded: {
			content: string;
			fileNames: string[];
			files: File[];
			totalFiles: number;
			folderName?: string;
		};
		uploadError: { error: string };
	}>();

	function validateFile(file: File): { valid: boolean; error?: string } {
		// Check file size
		if (file.size > MAX_FILE_SIZE) {
			return {
				valid: false,
				error: `File "${file.name}" is too large. Maximum size is 20MB, but file is ${(file.size / 1024 / 1024).toFixed(2)}MB`
			};
		}

		// Check file extension
		const fileExtension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
		if (fileExtension && !ALLOWED_EXTENSIONS.includes(fileExtension)) {
			return {
				valid: false,
				error: `File type "${fileExtension}" is not supported. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`
			};
		}

		// Check MIME type (with fallback for files without proper MIME types)
		if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
			// Some systems don't set MIME types correctly, so check extension as fallback
			if (!fileExtension || !ALLOWED_EXTENSIONS.includes(fileExtension)) {
				return {
					valid: false,
					error: `File type "${file.type}" is not supported`
				};
			}
		}

		return { valid: true };
	}

	// Map of file processors by MIME type and extension
	const FILE_PROCESSORS: Record<string, (file: File) => () => Promise<string>> = {
		// PDF
		'application/pdf': (file) => () => readPdfAsText(file),
		'.pdf': (file) => () => readPdfAsText(file),

		// Word documents
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (file) => () =>
			readWordAsText(file),
		'application/msword': (file) => () => readWordAsText(file),
		'.docx': (file) => () => readWordAsText(file),
		'.doc': (file) => () => readWordAsText(file),

		// Excel files
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (file) => () =>
			readExcelAsText(file),
		'application/vnd.ms-excel': (file) => () => readExcelAsText(file),
		'.xlsx': (file) => () => readExcelAsText(file),
		'.xls': (file) => () => readExcelAsText(file),

		// Text-based files
		'text/plain': (file) => () => file.text(),
		'text/markdown': (file) => () => file.text(),
		'text/csv': (file) => () => file.text(),
		'.txt': (file) => () => file.text(),
		'.md': (file) => () => file.text(),
		'.markdown': (file) => () => file.text(),
		'.csv': (file) => () => file.text()
	};

	function getFileProcessor(file: File, fileExtension: string | undefined): () => Promise<string> {
		// Try to find processor by MIME type first
		const processorByType = FILE_PROCESSORS[file.type];
		if (processorByType) {
			return processorByType(file);
		}

		// Fall back to extension
		if (fileExtension) {
			const processorByExt = FILE_PROCESSORS[fileExtension];
			if (processorByExt) {
				return processorByExt(file);
			}
		}

		throw new Error(`Unsupported file type: ${file.name}`);
	}

	async function processFile(file: File): Promise<string> {
		// Validate file before processing
		const validation = validateFile(file);
		if (!validation.valid) {
			throw new Error(validation.error);
		}

		const fileExtension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];

		try {
			const processor = getFileProcessor(file, fileExtension);
			return await processor();
		} catch (error) {
			console.error(`Error processing file ${file.name}:`, error);
			throw error;
		}
	}

	// Read content from a Word file (DOCX)
	async function readWordAsText(file: File): Promise<string> {
		try {
			const arrayBuffer = await file.arrayBuffer();
			const result = await mammoth.extractRawText({ arrayBuffer });
			return result.value.trim();
		} catch (error) {
			console.error('Error reading Word file:', error);
			return 'Error extracting text from Word document.';
		}
	}

	// Read content from an Excel file
	async function readExcelAsText(file: File): Promise<string> {
		try {
			const arrayBuffer = await file.arrayBuffer();
			const workbook = XLSX.read(arrayBuffer, { type: 'array' });
			let text = '';

			workbook.SheetNames.forEach((sheetName) => {
				const sheet = workbook.Sheets[sheetName];
				const sheetText = XLSX.utils.sheet_to_csv(sheet);
				text += `\n---\nSheet: ${sheetName}\n${sheetText}`;
			});

			return text.trim();
		} catch (error) {
			console.error('Error reading Excel file:', error);
			return 'Error extracting text from Excel file.';
		}
	}

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) {
			return;
		}

		await processFiles(Array.from(input.files));
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;

		if (!event.dataTransfer?.files || event.dataTransfer.files.length === 0) {
			return;
		}

		await processFiles(Array.from(event.dataTransfer.files));
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
	}

	function validateAllFiles(files: File[]): string[] {
		const errors: string[] = [];
		for (const file of files) {
			const validation = validateFile(file);
			if (!validation.valid) {
				errors.push(validation.error!);
			}
		}
		return errors;
	}

	function getFolderName(file: File): string | undefined {
		const pathParts = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.split(
			'/'
		);
		return pathParts && pathParts.length > 1 ? pathParts[0] : undefined;
	}

	function getFilePath(file: File): string {
		return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
	}

	async function processSingleFile(file: File): Promise<{ path: string; content: string } | null> {
		try {
			status = file.name;
			const fileContent = await processFile(file);
			const filePath = getFilePath(file);

			// Sanitize for security
			const sanitizedPath = DOMPurify.sanitize(filePath);
			const sanitizedContent = DOMPurify.sanitize(fileContent);

			processedFiles++;
			progress = (processedFiles / totalFiles) * 100;

			return { path: sanitizedPath, content: sanitizedContent };
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			console.warn(`Skipping file ${file.name}:`, error);
			throw new Error(`Error processing ${file.name}: ${errorMsg}`);
		}
	}

	async function processAllFiles(files: File[]): Promise<{
		combinedContent: string;
		fileNames: string[];
		errors: string[];
	}> {
		let combinedContent = '';
		const fileNames: string[] = [];
		const errors: string[] = [];

		for (const file of files) {
			try {
				const result = await processSingleFile(file);
				if (result) {
					combinedContent += `\n\n=== File: ${result.path} ===\n\n${result.content}`;
					fileNames.push(result.path);
				}
			} catch (error) {
				errors.push(error instanceof Error ? error.message : `Error with ${file.name}`);
			}
		}

		return { combinedContent, fileNames, errors };
	}

	function resetState() {
		isProcessing = false;
		status = '';
		progress = 0;
		totalFiles = 0;
		processedFiles = 0;
		// Reset file inputs
		const fileInput = document.getElementById('file-input') as HTMLInputElement;
		const folderInput = document.getElementById('folder-input') as HTMLInputElement;
		if (fileInput) fileInput.value = '';
		if (folderInput) folderInput.value = '';
	}

	async function processFiles(files: File[]) {
		isProcessing = true;
		const errors: string[] = [];

		totalFiles = files.length;
		processedFiles = 0;
		status = 'Validating files...';

		// Validate all files first
		const validationErrors = validateAllFiles(files);
		if (validationErrors.length > 0) {
			dispatch('uploadError', { error: validationErrors.join('\n') });
			resetState();
			return;
		}

		status = 'Reading files...';

		try {
			const folderName = files[0] ? getFolderName(files[0]) : undefined;

			// Process each file
			const { combinedContent, fileNames, errors: processingErrors } = await processAllFiles(files);
			errors.push(...processingErrors);

			if (combinedContent.trim().length === 0) {
				throw new Error('No content could be extracted from the uploaded files');
			}

			status = 'Finalizing...';
			dispatch('filesUploaded', {
				content: combinedContent.trim(),
				fileNames,
				files,
				totalFiles: files.length,
				folderName
			});
		} catch (error) {
			console.error('Error processing files:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			dispatch('uploadError', { error: errorMessage });
		} finally {
			resetState();
		}
	}
</script>

<Card
	class="border-dashed p-8 transition-colors {className} {isDragging
		? 'border-primary bg-primary/5'
		: ''}"
	ondrop={handleDrop}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
>
	<div class="pointer-events-none flex flex-col items-center justify-center space-y-4 text-center">
		{#if isProcessing}
			<Loader2 class="text-muted-foreground h-12 w-12 animate-spin" />
			<div class="flex w-64 flex-col items-center space-y-3">
				{#if totalFiles > 0}
					<div class="flex flex-col items-center space-y-2">
						<p class="text-muted-foreground text-xs">
							Processing {processedFiles} of {totalFiles} files
						</p>
						<div class="bg-secondary h-2 w-full rounded-full">
							<div
								class="bg-primary h-2 rounded-full transition-all duration-300"
								style="width: {progress}%"
							></div>
						</div>
					</div>
				{/if}
				<div class="flex min-h-[1.5rem] items-center justify-center">
					<p class="max-w-full truncate text-center text-sm font-medium">{status}</p>
				</div>
			</div>
		{:else}
			<div class="flex flex-col items-center space-y-2">
				<div class="bg-muted rounded-full p-3">
					<Upload class="text-muted-foreground h-6 w-6" />
				</div>
				<div class="space-y-1">
					<p class="text-sm font-medium">Drop files here or click to upload</p>
					<p class="text-muted-foreground text-xs">
						Upload multiple files or folders with your project documentation
					</p>
				</div>
			</div>
			<div class="pointer-events-auto flex gap-4">
				<div class="relative">
					<input
						type="file"
						multiple
						class="hidden"
						onchange={handleFileChange}
						disabled={disabled || isProcessing}
						id="file-input"
						accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv,.js,.ts,.jsx,.tsx,.py,.java,.c,.cpp,.cs,.php,.rb,.go,.rs,.swift,.kt"
					/>
					<Button
						variant="outline"
						size="sm"
						onclick={() => document.getElementById('file-input')?.click()}
						disabled={disabled || isProcessing}
						class="gap-2"
					>
						<FileText class="h-4 w-4" />
						Select Files
					</Button>
				</div>
				<div class="relative">
					<input
						type="file"
						webkitdirectory
						multiple
						class="hidden"
						onchange={handleFileChange}
						disabled={disabled || isProcessing}
						id="folder-input"
					/>
					<Button
						variant="outline"
						size="sm"
						onclick={() => document.getElementById('folder-input')?.click()}
						disabled={disabled || isProcessing}
						class="gap-2"
					>
						<Folder class="h-4 w-4" />
						Select Folder
					</Button>
				</div>
			</div>
		{/if}
	</div>
</Card>

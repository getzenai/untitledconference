<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import TiptapEditor from './TiptapEditor.svelte';
	import type { JSONContent } from '@tiptap/core';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import TrashIcon from '@lucide/svelte/icons/trash';

	// Props
	export let document: {
		id: number;
		title: string;
		content: JSONContent | unknown;
		plainText: string | null;
	};
	export let form: {
		success?: boolean;
		document?: typeof document;
		error?: string;
		transformed?: string;
		mock?: boolean;
		action?: string;
	} | null = null;
	export let showDelete = true;
	export let showBackButton = true;
	export let backUrl = '/documents';
	export let deleteRedirect = '/documents';
	let className = '';
	export { className as class };

	// State
	let saveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
	let editorComponent: TiptapEditor | null = null;
	let titleDebounceTimer: ReturnType<typeof setTimeout>;
	let contentDebounceTimer: ReturnType<typeof setTimeout>;
	let documentTitle = document.title;
	let lastSavedTitle = document.title;
	let lastSavedContent = JSON.stringify(document.content);

	// Handle form response
	$: if (form?.success && form.document) {
		saveStatus = 'saved';
		lastSavedTitle = form.document.title;
		lastSavedContent = JSON.stringify(form.document.content);
		setTimeout(() => {
			saveStatus = 'idle';
		}, 2000);
	} else if (form?.error) {
		saveStatus = 'error';
		setTimeout(() => {
			saveStatus = 'idle';
		}, 3000);
	}

	async function saveDocument(content: JSONContent, plainText: string, immediate = false) {
		// Clear existing timer
		clearTimeout(contentDebounceTimer);

		const save = async () => {
			// Skip if nothing changed
			const currentContent = JSON.stringify(content);
			if (lastSavedTitle === documentTitle && lastSavedContent === currentContent) {
				return;
			}

			saveStatus = 'saving';

			const formData = new FormData();
			formData.append('title', documentTitle);
			formData.append('content', currentContent);
			formData.append('plainText', plainText);

			try {
				// Use the current page's update action
				const response = await fetch(`${$page.url.pathname}?/update`, {
					method: 'POST',
					body: formData
				});

				const result = await response.text();
				const { type, data: resultData } = JSON.parse(result);

				if (type === 'success' || (type === 'data' && resultData?.success)) {
					saveStatus = 'saved';
					lastSavedTitle = documentTitle;
					lastSavedContent = currentContent;
					setTimeout(() => {
						saveStatus = 'idle';
					}, 2000);
				} else {
					saveStatus = 'error';
					setTimeout(() => {
						saveStatus = 'idle';
					}, 3000);
				}
			} catch (error) {
				console.error('Failed to save document:', error);
				saveStatus = 'error';
				setTimeout(() => {
					saveStatus = 'idle';
				}, 3000);
			}
		};

		if (immediate) {
			await save();
		} else {
			contentDebounceTimer = setTimeout(save, 500); // 500ms debounce for more frequent saves
		}
	}

	function handleTitleChange() {
		clearTimeout(titleDebounceTimer);
		titleDebounceTimer = setTimeout(() => {
			if (editorComponent) {
				editorComponent.saveNow(true);
			}
		}, 500); // 500ms debounce to match editor timing
	}

	function handleTitleBlur() {
		// Save immediately when title loses focus
		clearTimeout(titleDebounceTimer);
		if (editorComponent) {
			editorComponent.saveNow(true);
		}
	}

	onMount(() => {
		// Save on page unload - use beforeunload event to ensure save completes
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (editorComponent && editorComponent.hasUnsavedChanges()) {
				// Trigger save immediately
				editorComponent.saveNow(true);
				// Show browser dialog if there are unsaved changes (gives time for save to complete)
				e.preventDefault();
				e.returnValue = '';
			}
		};

		// Save when tab becomes hidden
		const handleVisibilityChange = () => {
			if (window.document.hidden && editorComponent) {
				editorComponent.saveNow(true);
			}
		};

		// Save when navigating away using SvelteKit navigation
		const handlePageHide = () => {
			if (editorComponent) {
				editorComponent.saveNow(true);
			}
		};

		window.addEventListener('beforeunload', handleBeforeUnload);
		window.addEventListener('pagehide', handlePageHide);
		window.document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			window.removeEventListener('pagehide', handlePageHide);
			window.document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	onDestroy(() => {
		// Save one last time on component destroy
		if (editorComponent) {
			editorComponent.saveNow(true);
		}
		clearTimeout(titleDebounceTimer);
		clearTimeout(contentDebounceTimer);
	});
</script>

<div class="flex h-full flex-col {className}">
	<!-- Header -->
	<div>
		<div class="container mx-auto px-4 py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					{#if showBackButton}
						<Button variant="ghost" size="icon" onclick={() => goto(backUrl)}>
							<ArrowLeftIcon class="h-4 w-4" />
						</Button>
					{/if}
					<Input
						type="text"
						bind:value={documentTitle}
						oninput={handleTitleChange}
						onblur={handleTitleBlur}
						class="border-0 text-xl font-semibold shadow-none focus-visible:ring-0"
						placeholder="Document Title"
					/>
					{#if saveStatus === 'error'}
						<Badge variant="destructive">
							<AlertCircleIcon class="mr-1 h-3 w-3" />
							Error saving
						</Badge>
					{/if}
				</div>
				{#if showDelete}
					<form
						method="POST"
						action="?/delete"
						use:enhance={() => {
							return async ({ result }) => {
								if (result.type === 'redirect') {
									goto(deleteRedirect);
								}
							};
						}}
					>
						<Button type="submit" variant="ghost" size="icon">
							<TrashIcon class="h-4 w-4" />
						</Button>
					</form>
				{/if}
			</div>
		</div>
	</div>

	<!-- Editor -->
	<div class="flex-1 overflow-hidden">
		<TiptapEditor
			bind:this={editorComponent}
			content={document.content as JSONContent}
			onUpdate={saveDocument}
			placeholder="Start writing your document..."
			class="h-full"
		/>
	</div>
</div>

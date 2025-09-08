<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';
	import type { JSONContent } from '@tiptap/core';
	import { AIContextMenu as AIContextMenuExtension } from './extensions/ai-context-menu-extension';
	import AIContextMenu from './AIContextMenu.svelte';
	import { TabHandler } from './extensions/tab-handler';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Toggle } from '$lib/components/ui/toggle/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { cn } from '$lib/utils.js';
	import BoldIcon from '@lucide/svelte/icons/bold';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import StrikethroughIcon from '@lucide/svelte/icons/strikethrough';
	import CodeIcon from '@lucide/svelte/icons/code';
	import Heading1Icon from '@lucide/svelte/icons/heading-1';
	import Heading2Icon from '@lucide/svelte/icons/heading-2';
	import Heading3Icon from '@lucide/svelte/icons/heading-3';
	import PilcrowIcon from '@lucide/svelte/icons/pilcrow';
	import ListIcon from '@lucide/svelte/icons/list';
	import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
	import QuoteIcon from '@lucide/svelte/icons/quote';
	import UndoIcon from '@lucide/svelte/icons/undo';
	import RedoIcon from '@lucide/svelte/icons/redo';

	export let content: JSONContent = {
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: []
			}
		]
	};
	export let placeholder = 'Start writing...';
	export let onUpdate:
		| ((content: JSONContent, plainText: string, immediate?: boolean) => void)
		| undefined = undefined;
	export let editable = true;
	let className = '';
	export { className as class };

	// Track if content has changed since last save
	let lastSavedContent = '';

	// Export a function to force save immediately
	export function saveNow(force = false) {
		if (editor && onUpdate) {
			const json = editor.getJSON();
			const text = editor.getText();
			const currentContent = JSON.stringify(json);

			// Only save if content actually changed (or if forced)
			if (force || currentContent !== lastSavedContent) {
				onUpdate(json, text, true); // Pass true for immediate save
				lastSavedContent = currentContent;
			}
		}
	}

	// Check if there are unsaved changes
	export function hasUnsavedChanges() {
		if (!editor) return false;
		const currentContent = JSON.stringify(editor.getJSON());
		return currentContent !== lastSavedContent;
	}

	let element: HTMLDivElement;
	let editor: Editor;

	// AI Context Menu state
	let aiMenuVisible = false;
	let aiMenuX = 0;
	let aiMenuY = 0;
	let aiMenuContent: Record<string, unknown> | null = null;
	let aiMenuDocumentContext: Record<string, unknown> | null = null;
	let savedSelection: { from: number; to: number } | null = null;

	// Debounce function for auto-save
	function debounce(
		func: (content: JSONContent, plainText: string) => void,
		wait: number
	): (content: JSONContent, plainText: string) => void {
		let timeout: ReturnType<typeof setTimeout>;
		return (content: JSONContent, plainText: string) => {
			clearTimeout(timeout);
			timeout = setTimeout(() => func(content, plainText), wait);
		};
	}

	const debouncedUpdate = debounce((content: JSONContent, plainText: string) => {
		if (onUpdate) {
			const currentContent = JSON.stringify(content);
			// Only save if content actually changed
			if (currentContent !== lastSavedContent) {
				onUpdate(content, plainText);
				lastSavedContent = currentContent;
			}
		}
	}, 500); // 500ms debounce for more frequent saves

	// Handle AI transformation result
	function handleAITransform(transformed: Record<string, unknown>) {
		if (editor && transformed) {
			if (savedSelection && savedSelection.from !== savedSelection.to) {
				// Replace selected content
				const { from, to } = savedSelection;
				editor.chain().focus().deleteRange({ from, to }).insertContent(transformed).run();
			} else {
				// Insert new content at cursor position
				editor.chain().focus().insertContent(transformed).run();
			}

			// Clear the saved selection
			savedSelection = null;
		}
	}

	onMount(() => {
		try {
			editor = new Editor({
				element: element,
				extensions: [
					StarterKit.configure({
						// Configure list behavior with standard settings
						bulletList: {
							keepMarks: true,
							keepAttributes: false,
							HTMLAttributes: {
								class: 'list-disc ml-6'
							}
						},
						orderedList: {
							keepMarks: true,
							keepAttributes: false,
							HTMLAttributes: {
								class: 'list-decimal ml-6'
							}
						},
						listItem: {
							HTMLAttributes: {}
						}
					}),
					TabHandler,
					Placeholder.configure({
						placeholder
					}),
					AIContextMenuExtension.configure({
						onContextMenu: ({ x, y, selectedContent, documentContext }) => {
							// Save the current selection before showing menu
							const { from, to } = editor.state.selection;
							savedSelection = { from, to };

							aiMenuX = x;
							aiMenuY = y;
							aiMenuContent = selectedContent;
							aiMenuDocumentContext = documentContext;
							aiMenuVisible = true;

							// Add a class to maintain selection visibility when AI menu is open
							if (from !== to) {
								editor.commands.setTextSelection({ from, to });
								element.classList.add('ai-menu-open');
							}
						}
					})
				],
				content,
				editable,
				onTransaction: () => {
					// Force re-render to update button states
					editor = editor;
				},
				onUpdate: ({ editor }) => {
					const json = editor.getJSON();
					const text = editor.getText();
					content = json;
					debouncedUpdate(json, text);
				},
				onBlur: ({ editor }) => {
					// Save immediately when editor loses focus
					if (onUpdate && hasUnsavedChanges()) {
						const json = editor.getJSON();
						const text = editor.getText();
						const currentContent = JSON.stringify(json);
						onUpdate(json, text, true); // Pass true for immediate save
						lastSavedContent = currentContent;
					}
				}
			});
			console.log('TiptapEditor: Editor initialized successfully');
		} catch (error) {
			console.error('TiptapEditor: Failed to initialize editor:', error);
		}
	});

	onDestroy(() => {
		if (editor) {
			editor.destroy();
		}
	});

	// Export a function to update content when switching documents
	export function loadContent(newContent: JSONContent) {
		if (editor) {
			editor.commands.setContent(newContent);
			// Reset the last saved content to match the newly loaded content
			lastSavedContent = JSON.stringify(newContent);
		}
	}

	// Button actions
	const toggleBold = () => editor.chain().focus().toggleBold().run();
	const toggleItalic = () => editor.chain().focus().toggleItalic().run();
	const toggleStrike = () => editor.chain().focus().toggleStrike().run();
	const toggleCode = () => editor.chain().focus().toggleCode().run();

	const setHeading = (level: 1 | 2 | 3) => {
		editor.chain().focus().toggleHeading({ level }).run();
	};

	const setParagraph = () => editor.chain().focus().setParagraph().run();
	const toggleBulletList = () => editor.chain().focus().toggleBulletList().run();
	const toggleOrderedList = () => editor.chain().focus().toggleOrderedList().run();
	const toggleBlockquote = () => editor.chain().focus().toggleBlockquote().run();

	const undo = () => editor.chain().focus().undo().run();
	const redo = () => editor.chain().focus().redo().run();

	// Helper to check if a mark/node is active
	$: isBold = editor?.isActive('bold');
	$: isItalic = editor?.isActive('italic');
	$: isStrike = editor?.isActive('strike');
	$: isCode = editor?.isActive('code');
	$: isH1 = editor?.isActive('heading', { level: 1 });
	$: isH2 = editor?.isActive('heading', { level: 2 });
	$: isH3 = editor?.isActive('heading', { level: 3 });
	$: isBulletList = editor?.isActive('bulletList');
	$: isOrderedList = editor?.isActive('orderedList');
	$: isBlockquote = editor?.isActive('blockquote');
	$: canUndo = editor?.can().undo();
	$: canRedo = editor?.can().redo();
</script>

<div class={cn('bg-background flex h-full flex-col overflow-hidden rounded-lg border', className)}>
	<!-- Toolbar -->
	<div
		class="bg-background sticky top-0 z-10 flex flex-shrink-0 flex-wrap items-center gap-1 border-b p-1"
	>
		<div class="flex items-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				onclick={undo}
				disabled={!canUndo}
				title="Undo (Ctrl+Z)"
				class="h-8 w-8"
			>
				<UndoIcon class="h-4 w-4" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				onclick={redo}
				disabled={!canRedo}
				title="Redo (Ctrl+Y)"
				class="h-8 w-8"
			>
				<RedoIcon class="h-4 w-4" />
			</Button>
		</div>

		<Separator orientation="vertical" class="mx-1 h-6" />

		<div class="flex items-center gap-1">
			<Toggle
				pressed={!isH1 && !isH2 && !isH3}
				onPressedChange={() => setParagraph()}
				size="sm"
				title="Paragraph"
			>
				<PilcrowIcon class="h-4 w-4" />
			</Toggle>
			<Toggle pressed={isH1} onPressedChange={() => setHeading(1)} size="sm" title="Heading 1">
				<Heading1Icon class="h-4 w-4" />
			</Toggle>
			<Toggle pressed={isH2} onPressedChange={() => setHeading(2)} size="sm" title="Heading 2">
				<Heading2Icon class="h-4 w-4" />
			</Toggle>
			<Toggle pressed={isH3} onPressedChange={() => setHeading(3)} size="sm" title="Heading 3">
				<Heading3Icon class="h-4 w-4" />
			</Toggle>
		</div>

		<Separator orientation="vertical" class="mx-1 h-6" />

		<div class="flex items-center gap-1">
			<Toggle pressed={isBold} onPressedChange={toggleBold} size="sm" title="Bold (Ctrl+B)">
				<BoldIcon class="h-4 w-4" />
			</Toggle>
			<Toggle pressed={isItalic} onPressedChange={toggleItalic} size="sm" title="Italic (Ctrl+I)">
				<ItalicIcon class="h-4 w-4" />
			</Toggle>
			<Toggle pressed={isStrike} onPressedChange={toggleStrike} size="sm" title="Strikethrough">
				<StrikethroughIcon class="h-4 w-4" />
			</Toggle>
			<Toggle pressed={isCode} onPressedChange={toggleCode} size="sm" title="Code">
				<CodeIcon class="h-4 w-4" />
			</Toggle>
		</div>

		<Separator orientation="vertical" class="mx-1 h-6" />

		<div class="flex items-center gap-1">
			<Toggle
				pressed={isBulletList}
				onPressedChange={toggleBulletList}
				size="sm"
				title="Bullet List"
			>
				<ListIcon class="h-4 w-4" />
			</Toggle>
			<Toggle
				pressed={isOrderedList}
				onPressedChange={toggleOrderedList}
				size="sm"
				title="Ordered List"
			>
				<ListOrderedIcon class="h-4 w-4" />
			</Toggle>
			<Toggle
				pressed={isBlockquote}
				onPressedChange={toggleBlockquote}
				size="sm"
				title="Blockquote"
			>
				<QuoteIcon class="h-4 w-4" />
			</Toggle>
		</div>
	</div>

	<!-- Editor -->
	<div bind:this={element} class="editor-content flex-1 overflow-y-auto"></div>

	<!-- AI Context Menu -->
	<AIContextMenu
		bind:visible={aiMenuVisible}
		x={aiMenuX}
		y={aiMenuY}
		selectedContent={aiMenuContent}
		documentContext={aiMenuDocumentContext}
		onTransform={handleAITransform}
		onClose={() => {
			aiMenuVisible = false;
			aiMenuContent = null;
			aiMenuDocumentContext = null;
			// Remove the class when menu closes
			element?.classList.remove('ai-menu-open');
		}}
	/>
</div>

<style>
	.editor-content {
		padding: 2rem;
	}

	/* ProseMirror styles - using CSS variables that match shadcn/ui theme */
	:global(.editor-content .ProseMirror) {
		min-height: 100%;
		outline: none;
		caret-color: auto;
		line-height: 1.75;
		font-size: 1rem;
		color: hsl(var(--foreground));
	}

	/* Text selection styles for light mode */
	:global(.editor-content .ProseMirror::selection),
	:global(.editor-content .ProseMirror *::selection) {
		background: rgba(59, 130, 246, 0.4) !important;
	}

	/* Firefox selection for light mode */
	:global(.editor-content .ProseMirror::-moz-selection),
	:global(.editor-content .ProseMirror *::-moz-selection) {
		background: rgba(59, 130, 246, 0.4) !important;
	}

	/* Dark mode selection */
	:global(.dark .editor-content .ProseMirror::selection),
	:global(.dark .editor-content .ProseMirror *::selection) {
		background: rgba(99, 179, 255, 0.4) !important;
	}

	:global(.dark .editor-content .ProseMirror::-moz-selection),
	:global(.dark .editor-content .ProseMirror *::-moz-selection) {
		background: rgba(99, 179, 255, 0.4) !important;
	}

	/* Keep selection visible when AI menu is open */
	:global(.ai-menu-open .ProseMirror) {
		position: relative;
	}

	/* When AI menu is open, keep showing selection */
	:global(.ai-menu-open .ProseMirror::selection),
	:global(.ai-menu-open .ProseMirror *::selection) {
		background: rgba(59, 130, 246, 0.4) !important;
	}

	:global(.ai-menu-open .ProseMirror::-moz-selection),
	:global(.ai-menu-open .ProseMirror *::-moz-selection) {
		background: rgba(59, 130, 246, 0.4) !important;
	}

	:global(.editor-content .ProseMirror p) {
		margin: 0 0 1rem 0;
	}

	:global(.editor-content .ProseMirror p:last-child) {
		margin-bottom: 0;
	}

	:global(.editor-content .ProseMirror h1) {
		font-size: 2rem;
		font-weight: 700;
		margin: 0 0 1rem 0;
		line-height: 1.25;
	}

	:global(.editor-content .ProseMirror h2) {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		line-height: 1.33;
	}

	:global(.editor-content .ProseMirror h3) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		line-height: 1.4;
	}

	:global(.editor-content .ProseMirror ul),
	:global(.editor-content .ProseMirror ol) {
		padding-left: 2rem;
		margin: 0 0 1rem 0;
		list-style-position: outside;
	}

	:global(.editor-content .ProseMirror ul) {
		list-style-type: disc;
	}

	:global(.editor-content .ProseMirror ol) {
		list-style-type: decimal;
	}

	:global(.editor-content .ProseMirror li) {
		margin: 0.25rem 0;
		display: list-item;
	}

	:global(.editor-content .ProseMirror li > p) {
		margin: 0;
	}

	:global(.editor-content .ProseMirror li > p:not(:last-child)) {
		margin-bottom: 0.25rem;
	}

	:global(.editor-content .ProseMirror ul ul) {
		list-style-type: circle;
		margin-top: 0.25rem;
	}

	:global(.editor-content .ProseMirror ul ul ul) {
		list-style-type: square;
	}

	:global(.editor-content .ProseMirror ol ol) {
		list-style-type: lower-alpha;
		margin-top: 0.25rem;
	}

	:global(.editor-content .ProseMirror ol ol ol) {
		list-style-type: lower-roman;
	}

	:global(.editor-content .ProseMirror blockquote) {
		padding-left: 1rem;
		border-left: 3px solid hsl(var(--border));
		color: hsl(var(--muted-foreground));
		font-style: italic;
		margin: 0 0 1rem 0;
	}

	:global(.editor-content .ProseMirror code) {
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-family: monospace;
		font-size: 0.875em;
	}

	:global(.editor-content .ProseMirror pre) {
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		overflow-x: auto;
		margin: 0 0 1rem 0;
		font-family: monospace;
	}

	:global(.editor-content .ProseMirror pre code) {
		background: none;
		padding: 0;
		color: inherit;
	}

	:global(.editor-content .ProseMirror p.is-editor-empty:first-child::before) {
		color: rgb(156, 163, 175); /* Gray-400 */
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
	}

	/* Dark mode placeholder */
	:global(.dark .editor-content .ProseMirror p.is-editor-empty:first-child::before) {
		color: rgb(107, 114, 128); /* Gray-500 */
	}
</style>

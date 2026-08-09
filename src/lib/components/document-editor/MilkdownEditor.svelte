<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import {
		Editor,
		defaultValueCtx,
		editorViewCtx,
		editorViewOptionsCtx,
		rootCtx
	} from '@milkdown/kit/core';
	import type { Ctx } from '@milkdown/kit/ctx';
	import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
	import { history, redoCommand, undoCommand } from '@milkdown/kit/plugin/history';
	import {
		commonmark,
		liftListItemCommand,
		toggleEmphasisCommand,
		toggleInlineCodeCommand,
		toggleStrongCommand,
		turnIntoTextCommand,
		wrapInBlockquoteCommand,
		wrapInBulletListCommand,
		wrapInHeadingCommand,
		wrapInOrderedListCommand
	} from '@milkdown/kit/preset/commonmark';
	import { gfm, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
	import { lift } from '@milkdown/kit/prose/commands';
	import { redoDepth, undoDepth } from '@milkdown/kit/prose/history';
	import type { EditorState } from '@milkdown/kit/prose/state';
	import { callCommand, getMarkdown, replaceRange } from '@milkdown/kit/utils';
	import AIContextMenu from './AIContextMenu.svelte';
	import { aiContextMenuPlugin, type AIContextMenuEvent } from './ai-context-menu-plugin';
	import { placeholderPlugin } from './placeholder-plugin';
	import { toolbarStatePlugin } from './toolbar-state-plugin';
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

	interface Props {
		/** Initial markdown (CommonMark + GFM); later changes go through `loadContent`. */
		content?: string;
		placeholder?: string;
		onUpdate?: ((markdown: string, plainText: string, immediate?: boolean) => void) | undefined;
		editable?: boolean;
		class?: string;
	}

	let {
		content = '',
		placeholder = 'Start writing...',
		onUpdate = undefined,
		editable = true,
		class: className = ''
	}: Props = $props();

	const SAVE_DEBOUNCE_MS = 500;

	// The editor owns the markdown once it is mounted; `content` only seeds it.
	let currentMarkdown = $state(untrack(() => content));
	let element: HTMLDivElement | undefined = $state();
	let editorInstance: Editor | undefined;
	let lastSavedContent = '';
	let isDestroyed = false;
	let isInitializing = false;

	// Toolbar state, kept in sync by a ProseMirror plugin on every editor update
	let activeMarks = $state<string[]>([]);
	let activeContainer = $state('');
	let activeHeadingLevel = $state(0);
	let canUndo = $state(false);
	let canRedo = $state(false);

	// AI assistant state
	let aiMenuVisible = $state(false);
	let aiMenuX = $state(0);
	let aiMenuY = $state(0);
	let aiMenuContent = $state<string | null>(null);
	let aiMenuDocumentContext = $state<AIContextMenuEvent['documentContext'] | null>(null);
	let aiMenuRange: AIContextMenuEvent['range'] | null = null;

	/**
	 * Milkdown's markdown listener lags a keystroke or two behind, so serialize on
	 * demand whenever an exact answer matters (unload, blur, navigation).
	 */
	function readMarkdown(): string {
		if (editorInstance) {
			try {
				currentMarkdown = editorInstance.action(getMarkdown());
			} catch {
				// keep the last value the listener reported
			}
		}
		return currentMarkdown;
	}

	function getPlainText(): string {
		if (!editorInstance) return '';

		try {
			const { doc } = editorInstance.ctx.get(editorViewCtx).state;
			return doc.textBetween(0, doc.content.size, '\n', ' ');
		} catch {
			return '';
		}
	}

	let saveTimer: ReturnType<typeof setTimeout>;

	function scheduleSave(markdown: string) {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			if (onUpdate && markdown !== lastSavedContent) {
				onUpdate(markdown, getPlainText());
				lastSavedContent = markdown;
			}
		}, SAVE_DEBOUNCE_MS);
	}

	/** Save right away instead of waiting for the debounce (navigation, blur, unload). */
	export function saveNow(force = false) {
		clearTimeout(saveTimer);

		if (!editorInstance || !onUpdate) return;

		const markdown = readMarkdown();
		if (!force && markdown === lastSavedContent) return;

		onUpdate(markdown, getPlainText(), true);
		lastSavedContent = markdown;
	}

	export function hasUnsavedChanges() {
		return Boolean(editorInstance) && readMarkdown() !== lastSavedContent;
	}

	/** Replace the whole document, e.g. when switching to another document. */
	export function loadContent(newContent: string) {
		currentMarkdown = newContent;
		lastSavedContent = newContent;
		void initEditor();
	}

	function isMarkActive(state: EditorState, markName: string): boolean {
		const type = state.schema.marks[markName];
		if (!type) return false;

		const { empty, from, to } = state.selection;
		if (empty) {
			return Boolean(type.isInSet(state.storedMarks || state.selection.$from.marks()));
		}
		return state.doc.rangeHasMark(from, to, type);
	}

	function syncToolbarState(state: EditorState) {
		activeMarks = ['strong', 'emphasis', 'inlineCode', 'strike_through'].filter((mark) =>
			isMarkActive(state, mark)
		);

		const cursor = state.selection.$from;
		activeHeadingLevel =
			cursor.parent.type.name === 'heading' ? Number(cursor.parent.attrs.level ?? 0) : 0;

		activeContainer = '';
		for (let depth = cursor.depth; depth > 0; depth--) {
			const name = cursor.node(depth).type.name;
			if (name === 'bullet_list' || name === 'ordered_list' || name === 'blockquote') {
				activeContainer = name;
				break;
			}
		}

		canUndo = undoDepth(state) > 0;
		canRedo = redoDepth(state) > 0;
	}

	function handleContextMenu(event: AIContextMenuEvent) {
		aiMenuX = event.x;
		aiMenuY = event.y;
		aiMenuContent = event.selectedMarkdown;
		aiMenuDocumentContext = event.documentContext;
		aiMenuRange = event.range;
		aiMenuVisible = true;
	}

	function handleAITransform(markdown: string) {
		if (!editorInstance || !aiMenuRange) return;

		editorInstance.action(replaceRange(markdown, aiMenuRange));
		aiMenuRange = null;
		focusEditor();
	}

	function focusEditor() {
		editorInstance?.action((ctx) => ctx.get(editorViewCtx).focus());
	}

	function runAction(action: (ctx: Ctx) => unknown) {
		if (!editorInstance) return;

		try {
			editorInstance.action(action);
			focusEditor();
		} catch (error) {
			console.error('Editor command failed:', error);
		}
	}

	const toggleBold = () => runAction(callCommand(toggleStrongCommand.key));
	const toggleItalic = () => runAction(callCommand(toggleEmphasisCommand.key));
	const toggleStrike = () => runAction(callCommand(toggleStrikethroughCommand.key));
	const toggleCode = () => runAction(callCommand(toggleInlineCodeCommand.key));
	const undo = () => runAction(callCommand(undoCommand.key));
	const redo = () => runAction(callCommand(redoCommand.key));
	const setParagraph = () => runAction(callCommand(turnIntoTextCommand.key));

	function setHeading(level: 1 | 2 | 3) {
		if (activeHeadingLevel === level) {
			setParagraph();
			return;
		}
		runAction(callCommand(wrapInHeadingCommand.key, level));
	}

	function toggleList(container: 'bullet_list' | 'ordered_list') {
		if (activeContainer === container) {
			runAction(callCommand(liftListItemCommand.key));
			return;
		}
		runAction(
			callCommand(
				container === 'bullet_list' ? wrapInBulletListCommand.key : wrapInOrderedListCommand.key
			)
		);
	}

	function toggleBlockquote() {
		if (activeContainer !== 'blockquote') {
			runAction(callCommand(wrapInBlockquoteCommand.key));
			return;
		}

		runAction((ctx) => {
			const view = ctx.get(editorViewCtx);
			return lift(view.state, view.dispatch);
		});
	}

	/**
	 * Milkdown's `destroy()` leaves its root markup behind, which would stack a
	 * second `.ProseMirror` on top of the first when the editor is recreated.
	 */
	function clearEditorDom() {
		if (!element) return;
		// eslint-disable-next-line svelte/no-dom-manipulating
		element.innerHTML = '';
	}

	async function initEditor() {
		// Creating the editor is async, so without this guard a second call can
		// slip in while the first one is still awaiting and mount two editors.
		if (!element || isDestroyed || isInitializing) return;
		isInitializing = true;

		if (editorInstance) {
			const previous = editorInstance;
			editorInstance = undefined;
			await previous.destroy().catch(() => {});
			clearEditorDom();
		}

		if (isDestroyed || !element) {
			isInitializing = false;
			return;
		}

		const initialContent = currentMarkdown;

		try {
			const created = await Editor.make()
				.config((ctx) => {
					ctx.set(rootCtx, element);
					ctx.set(defaultValueCtx, initialContent);
					ctx.update(editorViewOptionsCtx, (prev) => ({ ...prev, editable: () => editable }));
				})
				.use(commonmark)
				.use(gfm)
				.use(history)
				.use(listener)
				.use(placeholderPlugin(placeholder))
				.use(aiContextMenuPlugin(handleContextMenu))
				.use(toolbarStatePlugin(syncToolbarState))
				.config((ctx) => {
					ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
						if (markdown === prevMarkdown || typeof markdown !== 'string') return;
						currentMarkdown = markdown;
						scheduleSave(markdown);
					});
					ctx.get(listenerCtx).blur(() => saveNow());
				})
				.create();

			if (isDestroyed) {
				void created.destroy().catch(() => {});
				return;
			}

			editorInstance = created;
			// Compare against Milkdown's own serialization, otherwise a document that was
			// merely opened already looks unsaved (e.g. `-` bullets re-serialize as `*`).
			lastSavedContent = readMarkdown();
		} catch (error) {
			console.error('Failed to initialize Milkdown editor:', error);
		} finally {
			isInitializing = false;
		}
	}

	$effect(() => {
		if (!element) return;
		// untrack so a content change never re-creates the editor behind our back
		untrack(() => {
			if (!editorInstance) void initEditor();
		});
	});

	onDestroy(() => {
		isDestroyed = true;
		clearTimeout(saveTimer);
		clearEditorDom();
		editorInstance?.destroy().catch(() => {});
	});
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
				bind:pressed={() => activeHeadingLevel === 0, setParagraph}
				size="sm"
				title="Paragraph"
			>
				<PilcrowIcon class="h-4 w-4" />
			</Toggle>
			<Toggle
				bind:pressed={() => activeHeadingLevel === 1, () => setHeading(1)}
				size="sm"
				title="Heading 1"
			>
				<Heading1Icon class="h-4 w-4" />
			</Toggle>
			<Toggle
				bind:pressed={() => activeHeadingLevel === 2, () => setHeading(2)}
				size="sm"
				title="Heading 2"
			>
				<Heading2Icon class="h-4 w-4" />
			</Toggle>
			<Toggle
				bind:pressed={() => activeHeadingLevel === 3, () => setHeading(3)}
				size="sm"
				title="Heading 3"
			>
				<Heading3Icon class="h-4 w-4" />
			</Toggle>
		</div>

		<Separator orientation="vertical" class="mx-1 h-6" />

		<div class="flex items-center gap-1">
			<Toggle
				bind:pressed={() => activeMarks.includes('strong'), toggleBold}
				size="sm"
				title="Bold (Ctrl+B)"
			>
				<BoldIcon class="h-4 w-4" />
			</Toggle>
			<Toggle
				bind:pressed={() => activeMarks.includes('emphasis'), toggleItalic}
				size="sm"
				title="Italic (Ctrl+I)"
			>
				<ItalicIcon class="h-4 w-4" />
			</Toggle>
			<Toggle
				bind:pressed={() => activeMarks.includes('strike_through'), toggleStrike}
				size="sm"
				title="Strikethrough"
			>
				<StrikethroughIcon class="h-4 w-4" />
			</Toggle>
			<Toggle
				bind:pressed={() => activeMarks.includes('inlineCode'), toggleCode}
				size="sm"
				title="Code"
			>
				<CodeIcon class="h-4 w-4" />
			</Toggle>
		</div>

		<Separator orientation="vertical" class="mx-1 h-6" />

		<div class="flex items-center gap-1">
			<Toggle
				bind:pressed={() => activeContainer === 'bullet_list', () => toggleList('bullet_list')}
				size="sm"
				title="Bullet List"
			>
				<ListIcon class="h-4 w-4" />
			</Toggle>
			<Toggle
				bind:pressed={() => activeContainer === 'ordered_list', () => toggleList('ordered_list')}
				size="sm"
				title="Ordered List"
			>
				<ListOrderedIcon class="h-4 w-4" />
			</Toggle>
			<Toggle
				bind:pressed={() => activeContainer === 'blockquote', toggleBlockquote}
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
			aiMenuRange = null;
		}}
	/>
</div>

<style>
	.editor-content {
		padding: 2rem;
	}

	:global(.editor-content .ProseMirror) {
		min-height: 100%;
		outline: none;
		line-height: 1.75;
		font-size: 1rem;
		color: var(--foreground);
		word-wrap: break-word;
		white-space: pre-wrap;
	}

	:global(.editor-content .editor-placeholder::before) {
		content: attr(data-placeholder);
		color: var(--muted-foreground);
		float: left;
		height: 0;
		pointer-events: none;
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

	:global(.editor-content .ProseMirror blockquote) {
		padding-left: 1rem;
		border-left: 3px solid var(--border);
		color: var(--muted-foreground);
		font-style: italic;
		margin: 0 0 1rem 0;
	}

	:global(.editor-content .ProseMirror code) {
		background: var(--muted);
		color: var(--muted-foreground);
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-family: monospace;
		font-size: 0.875em;
	}

	:global(.editor-content .ProseMirror pre) {
		background: var(--muted);
		color: var(--muted-foreground);
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

	:global(.editor-content .ProseMirror hr) {
		border: none;
		border-top: 1px solid var(--border);
		margin: 1.5rem 0;
	}

	:global(.editor-content .ProseMirror table) {
		border-collapse: collapse;
		margin: 0 0 1rem 0;
		width: 100%;
	}

	:global(.editor-content .ProseMirror th),
	:global(.editor-content .ProseMirror td) {
		border: 1px solid var(--border);
		padding: 0.375rem 0.75rem;
		text-align: left;
	}
</style>

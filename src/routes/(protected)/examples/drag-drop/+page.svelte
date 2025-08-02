<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { GripVertical, Plus, Trash2 } from 'lucide-svelte';
	import { scale } from 'svelte/transition';

	interface Item {
		id: number;
		title: string;
		content: string;
	}

	let items = $state<Item[]>([
		{ id: 1, title: 'First Card', content: 'This is the content of the first card' },
		{ id: 2, title: 'Second Card', content: 'This is the content of the second card' },
		{ id: 3, title: 'Third Card', content: 'This is the content of the third card' }
	]);

	let draggedItem = $state<Item | null>(null);
	let draggedOverItem = $state<Item | null>(null);
	let dropPosition = $state<'above' | 'below' | null>(null);
	let nextId = $state(4);

	function handleDragStart(e: DragEvent, item: Item) {
		draggedItem = item;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleDragOver(e: DragEvent, item: Item) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}

		// Only update drop target if we're dragging over a different item
		if (draggedItem && draggedItem.id !== item.id) {
			// Determine drop position based on mouse position
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			const y = e.clientY - rect.top;
			const height = rect.height;

			draggedOverItem = item;
			dropPosition = y < height / 2 ? 'above' : 'below';
		}
	}

	function handleDragEnter(e: DragEvent, item: Item) {
		e.preventDefault();
		if (draggedItem && draggedItem.id !== item.id) {
			draggedOverItem = item;
		}
	}

	function handleDragLeave(e: DragEvent) {
		// Check if we're actually leaving the drop zone
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = e.clientX;
		const y = e.clientY;

		// Add a small buffer to prevent flickering at edges
		const buffer = 5;
		if (
			x < rect.left - buffer ||
			x > rect.right + buffer ||
			y < rect.top - buffer ||
			y > rect.bottom + buffer
		) {
			draggedOverItem = null;
			dropPosition = null;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (draggedItem && draggedOverItem && draggedItem.id !== draggedOverItem.id) {
			const draggedIndex = items.findIndex((item) => item.id === draggedItem!.id);
			let targetIndex = items.findIndex((item) => item.id === draggedOverItem!.id);

			// Adjust target index based on drop position
			if (dropPosition === 'below' && draggedIndex < targetIndex) {
				// No adjustment needed
			} else if (dropPosition === 'below') {
				targetIndex += 1;
			} else if (dropPosition === 'above' && draggedIndex > targetIndex) {
				// No adjustment needed
			}

			// Reorder items
			const newItems = [...items];
			const [removed] = newItems.splice(draggedIndex, 1);

			// Recalculate target index after removal
			if (draggedIndex < targetIndex) {
				targetIndex -= 1;
			}

			newItems.splice(targetIndex, 0, removed);
			items = newItems;
		}

		// Clean up
		draggedItem = null;
		draggedOverItem = null;
		dropPosition = null;
	}

	function handleDragEnd() {
		// Clean up drag state
		draggedItem = null;
		draggedOverItem = null;
		dropPosition = null;
	}

	function addItem() {
		items = [
			...items,
			{
				id: nextId++,
				title: `Card ${nextId}`,
				content: `This is the content of card ${nextId}`
			}
		];
	}

	function deleteItem(id: number) {
		items = items.filter((item) => item.id !== id);
	}
</script>

<div class="container mx-auto max-w-4xl py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold">Drag and Drop Example</h1>
		<p class="text-muted-foreground mt-2">
			Reorder cards by dragging them. The drop indicator shows where the card will be placed.
		</p>
	</div>

	<div class="mb-6">
		<Button onclick={addItem} class="gap-2">
			<Plus class="h-4 w-4" />
			Add Card
		</Button>
	</div>

	<div class="space-y-4">
		{#each items as item (item.id)}
			<div class="relative">
				{#if draggedItem && draggedOverItem && draggedOverItem.id === item.id && draggedItem.id !== item.id}
					{#if dropPosition === 'above'}
						<div
							class="bg-primary absolute -top-2 right-0 left-0 z-10 h-1 rounded-full"
							transition:scale={{ duration: 200 }}
						></div>
					{:else if dropPosition === 'below'}
						<div
							class="bg-primary absolute right-0 -bottom-2 left-0 z-10 h-1 rounded-full"
							transition:scale={{ duration: 200 }}
						></div>
					{/if}
				{/if}
				<Card
					draggable={true}
					ondragstart={(e) => handleDragStart(e, item)}
					ondragover={(e) => handleDragOver(e, item)}
					ondragenter={(e) => handleDragEnter(e, item)}
					ondrop={handleDrop}
					ondragleave={handleDragLeave}
					ondragend={handleDragEnd}
					class="cursor-move transition-all {draggedItem?.id === item.id ? 'opacity-50' : ''}"
				>
					<CardHeader>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<GripVertical class="text-muted-foreground h-5 w-5" />
								<CardTitle>{item.title}</CardTitle>
							</div>
							<Button
								variant="ghost"
								size="sm"
								class="text-destructive hover:bg-destructive hover:text-destructive-foreground"
								onclick={() => deleteItem(item.id)}
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					</CardHeader>
					<CardContent>
						<p class="text-muted-foreground">{item.content}</p>
					</CardContent>
				</Card>
			</div>
		{/each}
	</div>

	{#if items.length === 0}
		<Card class="border-dashed">
			<CardContent class="py-12 text-center">
				<p class="text-muted-foreground">No cards yet. Click "Add Card" to get started.</p>
			</CardContent>
		</Card>
	{/if}
</div>

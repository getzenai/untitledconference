<script lang="ts">
	import { run } from 'svelte/legacy';

	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import SendIcon from '@lucide/svelte/icons/send';
	import XIcon from '@lucide/svelte/icons/x';
	import { browser } from '$app/environment';
	import { onDestroy, tick } from 'svelte';

	interface Props {
		visible?: boolean;
		x?: number;
		y?: number;
		selectedContent?: Record<string, unknown> | null;
		documentContext?: Record<string, unknown> | null;
		onTransform?: ((result: Record<string, unknown>) => void) | undefined;
		onClose?: (() => void) | undefined;
	}

	let {
		visible = $bindable(false),
		x = 0,
		y = 0,
		selectedContent = null,
		documentContext = null,
		onTransform = undefined,
		onClose = undefined
	}: Props = $props();

	// Calculate position to prevent going off-screen (hug the edges)
	let adjustedX = $derived(browser ? Math.min(x, window.innerWidth - 330) : x); // 320px width (w-80)
	let adjustedY = $derived(browser ? Math.min(y, window.innerHeight - 190) : y); // Approximate minimum height

	let prompt = $state('');
	let _selectedPreset = $state('');
	let isSubmitting = $state(false);
	let errorMessage = $state('');

	let formElement: HTMLFormElement | undefined = $state();

	const presetPrompts = [
		{
			value: 'improve',
			label: 'Improve writing',
			prompt: 'Improve the clarity and flow of this text while maintaining its meaning'
		},
		{
			value: 'grammar',
			label: 'Fix grammar',
			prompt: 'Fix any grammar, spelling, and punctuation errors'
		},
		{
			value: 'zen',
			label: 'Make it zen',
			prompt:
				'Rewrite this text in a calm, mindful, and zen-like style with simple wisdom and peaceful flow'
		}
	];

	// Watch for preset selection changes and auto-submit
	run(() => {
		if (_selectedPreset) {
			const preset = presetPrompts.find((p) => p.value === _selectedPreset);
			if (preset) {
				// Check if we have selected content for transformation presets
				if (!selectedContent) {
					errorMessage = 'Please select some text first to apply this transformation';
					_selectedPreset = ''; // Reset the selection
				} else {
					prompt = preset.prompt;
					// Auto-submit after next tick when DOM is updated
					tick().then(() => {
						if (formElement) {
							formElement.requestSubmit();
						}
					});
				}
			}
		}
	});

	function handleClose() {
		visible = false;
		prompt = '';
		_selectedPreset = '';
		isSubmitting = false;
		errorMessage = '';
		onClose?.();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}

	// Close when clicking outside
	function handleClickOutside(e: MouseEvent) {
		if (!isSubmitting) {
			const target = e.target as HTMLElement;
			if (!target.closest('.ai-context-menu')) {
				handleClose();
			}
		}
	}

	run(() => {
		if (browser) {
			if (visible) {
				// Add event listeners when menu becomes visible
				setTimeout(() => {
					window.addEventListener('click', handleClickOutside);
					window.addEventListener('keydown', handleKeydown);
				}, 0);
			} else {
				// Clean up event listeners
				window.removeEventListener('click', handleClickOutside);
				window.removeEventListener('keydown', handleKeydown);
			}
		}
	});

	// Cleanup on destroy
	onDestroy(() => {
		if (browser) {
			window.removeEventListener('click', handleClickOutside);
			window.removeEventListener('keydown', handleKeydown);
		}
	});
</script>

{#if visible}
	<div
		class="ai-context-menu bg-popover fixed z-50 w-80 rounded-lg border p-3 shadow-lg"
		style="left: {adjustedX}px; top: {adjustedY}px;"
	>
		<form
			bind:this={formElement}
			method="POST"
			action="?/aiTransform"
			use:enhance={() => {
				isSubmitting = true;
				errorMessage = '';

				return async ({ result }) => {
					if (result.type === 'success') {
						const data = result.data as {
							success?: boolean;
							transformed?: unknown;
							error?: string;
						};
						if (data?.transformed) {
							onTransform?.(data.transformed as Record<string, unknown>);
							handleClose();
						} else {
							errorMessage = data?.error || 'Failed to transform content';
							isSubmitting = false;
						}
					} else if (result.type === 'failure') {
						const data = result.data as { error?: string };
						// Show more specific error messages
						if (data?.error?.includes('validation')) {
							errorMessage = 'AI generated invalid content format. Please try a simpler prompt.';
						} else {
							errorMessage = data?.error || 'AI transformation failed';
						}
						isSubmitting = false;
					} else if (result.type === 'error') {
						errorMessage = 'An unexpected error occurred. Please try again.';
						isSubmitting = false;
					} else {
						isSubmitting = false;
					}
					// Don't call update to prevent form reset
				};
			}}
		>
			<input type="hidden" name="content" value={JSON.stringify(selectedContent)} />
			<input type="hidden" name="documentContext" value={JSON.stringify(documentContext)} />
			<input type="hidden" name="prompt" value={prompt} />

			<div class="mb-3 flex items-center justify-between {isSubmitting ? 'ai-processing' : ''}">
				<div class="flex items-center gap-2 text-sm font-medium">
					<SparklesIcon class="h-4 w-4 {isSubmitting ? 'sparkle-pulse' : ''}" />
					<span class={isSubmitting ? 'processing-text' : ''}>
						{isSubmitting ? 'Processing...' : 'AI Assistant'}
					</span>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					onclick={handleClose}
					disabled={isSubmitting}
				>
					<XIcon class="h-3 w-3" />
				</Button>
			</div>

			<div class="space-y-3">
				<Select.Root type="single" bind:value={_selectedPreset}>
					<Select.Trigger class="w-full">
						{#if _selectedPreset}
							{presetPrompts.find((p) => p.value === _selectedPreset)?.label}
						{:else}
							Choose a preset or write custom
						{/if}
					</Select.Trigger>
					<Select.Content>
						{#each presetPrompts as preset}
							<Select.Item value={preset.value} label={preset.label}>
								{preset.label}
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				<div class="flex gap-2">
					<Input
						type="text"
						bind:value={prompt}
						placeholder="Or type your instruction..."
						disabled={isSubmitting}
						class="flex-1"
						onkeydown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								e.currentTarget.form?.requestSubmit();
							}
						}}
					/>
					<Button type="submit" size="icon" disabled={!prompt || isSubmitting}>
						<SendIcon class="h-4 w-4" />
					</Button>
				</div>

				{#if errorMessage}
					<div class="space-y-2">
						<div class="text-destructive text-xs">
							{errorMessage}
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							class="h-7 text-xs"
							onclick={() => {
								errorMessage = '';
								if (formElement && prompt) {
									formElement.requestSubmit();
								}
							}}
							disabled={isSubmitting || !prompt}
						>
							Retry
						</Button>
					</div>
				{:else if selectedContent}
					<div class="text-muted-foreground text-xs">
						{#if isSubmitting}
							Transforming content...
						{:else if selectedContent.type === 'text'}
							Selected text
						{:else if selectedContent.type}
							Selected: {selectedContent.type}
						{:else}
							Multiple blocks selected
						{/if}
					</div>
				{/if}
			</div>
		</form>
	</div>
{/if}

<style>
	.ai-context-menu {
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Mysterious wavering effect for the header during processing */
	.ai-processing {
		position: relative;
		overflow: hidden;
	}

	.ai-processing::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(
			90deg,
			transparent 0%,
			transparent 20%,
			rgba(147, 51, 234, 0.08) 35%,
			rgba(59, 130, 246, 0.12) 50%,
			rgba(147, 51, 234, 0.08) 65%,
			transparent 80%,
			transparent 100%
		);
		animation: shimmerWave 2s infinite;
		filter: blur(2px);
	}

	@keyframes shimmerWave {
		0% {
			left: -100%;
		}
		100% {
			left: 100%;
		}
	}

	/* Sparkle icon pulsing glow */
	:global(.sparkle-pulse) {
		animation: sparkleGlow 1.5s ease-in-out infinite;
	}

	@keyframes sparkleGlow {
		0%,
		100% {
			filter: drop-shadow(0 0 0 transparent);
			transform: scale(1);
		}
		50% {
			filter: drop-shadow(0 0 8px rgba(147, 51, 234, 0.6));
			transform: scale(1.1);
		}
	}

	/* Processing text shimmer */
	:global(.processing-text) {
		background: linear-gradient(
			90deg,
			currentColor 0%,
			rgba(147, 51, 234, 0.8) 50%,
			currentColor 100%
		);
		background-size: 200% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		animation: textShimmer 3s ease-in-out infinite;
	}

	@keyframes textShimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}
</style>

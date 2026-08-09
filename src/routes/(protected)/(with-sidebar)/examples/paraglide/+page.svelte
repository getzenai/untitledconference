<script lang="ts">
	import { locales, type Locale, getLocale, setLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages.js';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Languages } from 'lucide-svelte';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	const languages = locales;
	let currentLocale = $state(getLocale());

	function switchToLanguage(newLanguage: Locale) {
		// Use setLocale which will handle the URL change and page reload
		// This is the recommended way to switch locales in Paraglide
		setLocale(newLanguage);
		// Note: The page will reload, so the following line won't execute
		currentLocale = newLanguage;
	}

	const getLanguageLabel = (lang: Locale) => {
		return lang === 'en'
			? m.protected_examples_paraglide_language_english()
			: m.protected_examples_paraglide_language_german();
	};
</script>

<div class="container mx-auto max-w-4xl space-y-8 p-8">
	<Card>
		<CardHeader>
			<div class="flex items-center gap-2">
				<Languages class="h-6 w-6" />
				<CardTitle>{m.protected_examples_paraglide_page_title()}</CardTitle>
			</div>
			<CardDescription>
				{m.protected_examples_paraglide_page_description()}
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-6">
			<div class="flex flex-col gap-4">
				<div class="flex items-center gap-2">
					<span class="text-muted-foreground text-sm"
						>{m.protected_examples_paraglide_current_language()}:</span
					>
					<Badge variant="secondary" class="uppercase">
						{currentLocale}
					</Badge>
				</div>

				<div class="space-y-2">
					<div class="text-sm font-medium">{m.protected_examples_paraglide_select_language()}</div>
					<ToggleGroup.Root type="single" value={currentLocale} class="justify-start">
						{#each languages as language}
							<ToggleGroup.Item
								value={language}
								onclick={() => switchToLanguage(language)}
								aria-label={`Switch to ${getLanguageLabel(language)}`}
							>
								<span class="font-medium uppercase">{language}</span>
								<span class="text-muted-foreground ml-2">{getLanguageLabel(language)}</span>
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
				</div>
			</div>

			<div class="border-t pt-6">
				<h2 class="mb-4 text-2xl font-bold">
					{m.protected_examples_paraglide_hello_world({ name: 'SvelteKit User' })}
				</h2>
				<p class="text-muted-foreground">
					{m.protected_examples_paraglide_demo_description()}
				</p>
			</div>

			<Card class="bg-muted/50">
				<CardHeader>
					<CardTitle class="text-base">{m.protected_examples_paraglide_how_it_works()}</CardTitle>
				</CardHeader>
				<CardContent class="space-y-2 text-sm">
					<p>• {m.protected_examples_paraglide_how_it_works_1()}</p>
					<p>• {m.protected_examples_paraglide_how_it_works_2()}</p>
					<p>• {m.protected_examples_paraglide_how_it_works_3()}</p>
					<p>• {m.protected_examples_paraglide_how_it_works_4()}</p>
				</CardContent>
			</Card>

			<Card class="bg-muted/50">
				<CardHeader>
					<CardTitle class="text-base">Locale Override Example</CardTitle>
				</CardHeader>
				<CardContent class="space-y-3 text-sm">
					<p class="text-muted-foreground">
						You can override the locale for specific messages without changing the global locale:
					</p>
					<div class="space-y-2">
						<p>
							<span class="font-medium">Current locale ({currentLocale}):</span>
							<span class="ml-2"
								>{m.protected_examples_paraglide_hello_world({ name: 'Developer' })}</span
							>
						</p>
						<p>
							<span class="font-medium">Force English:</span>
							<span class="ml-2"
								>{m.protected_examples_paraglide_hello_world(
									{ name: 'Developer' },
									{ locale: 'en' }
								)}</span
							>
						</p>
						<p>
							<span class="font-medium">Force German:</span>
							<span class="ml-2"
								>{m.protected_examples_paraglide_hello_world(
									{ name: 'Developer' },
									{ locale: 'de' }
								)}</span
							>
						</p>
					</div>
				</CardContent>
			</Card>
		</CardContent>
	</Card>
</div>

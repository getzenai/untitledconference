<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import type { ActionData } from './$types';
	export let form: ActionData;
</script>

<div
	class="container relative grid min-h-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0"
>
	<div class="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
		<div class="absolute inset-0 bg-zinc-900"></div>
		<div class="relative z-20 flex flex-1 flex-col justify-center">
			<div class="mb-8 text-right">
				<span class="text-2xl font-bold">SvelteKit Vibe Starter</span>
			</div>
			<blockquote class="space-y-2 text-right">
				<p class="text-lg">
					A powerful SvelteKit starter application to vibe code with RooCode, featuring modern
					authentication, database integration, and beautiful UI components.
				</p>
			</blockquote>
			<div class="mt-6 space-y-4 text-right">
				<h3 class="text-xl font-semibold">Features:</h3>
				<ul class="space-y-2">
					<li>• Modern Authentication with Lucia</li>
					<li>• PostgreSQL Database with Drizzle ORM</li>
					<li>• Beautiful UI Components with shadcn</li>
					<li>• Internationalization with Paraglide</li>
					<li>• Type-safe Database Operations</li>
				</ul>
			</div>
		</div>
	</div>
	<div class="flex h-full items-center p-4 lg:p-8">
		<div class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<Card>
				<CardHeader>
					<CardTitle>Login</CardTitle>
					<CardDescription>Enter your credentials to access your account</CardDescription>
				</CardHeader>
				<CardContent>
					<form method="POST" class="space-y-4">
						<div class="space-y-2">
							<Label for="email">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="Enter your email"
								value={form?.email ?? ''}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="password">Password</Label>
							<Input
								id="password"
								name="password"
								type="password"
								placeholder="Enter your password"
								required
							/>
						</div>
						{#if form?.error}
							<p class="text-sm text-red-500">{form.error}</p>
						{/if}
						<Button type="submit" class="w-full">Login</Button>
						<p class="text-center text-sm text-muted-foreground">
							Don't have an account? <a href="/register" class="text-primary hover:underline"
								>Register</a
							>
						</p>
					</form>
				</CardContent>
			</Card>
		</div>
	</div>
</div>

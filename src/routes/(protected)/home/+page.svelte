<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
</script>

<div class="container py-8">
	<Card>
		<CardHeader>
			<CardTitle>Protected Dashboard</CardTitle>
			<CardDescription>This page is only visible to authenticated users</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="space-y-4">
				<p>Welcome, {$page.data.user?.email}!</p>

				<div class="flex flex-col gap-4 sm:flex-row">
					<form action="/api/auth/logout" method="POST">
						<Button type="submit" variant="outline">Logout</Button>
					</form>
				</div>
			</div>
		</CardContent>
	</Card>
</div>

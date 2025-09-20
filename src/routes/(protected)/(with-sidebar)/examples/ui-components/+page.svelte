<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Switch } from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import {
		Table,
		TableBody,
		TableCaption,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
		DialogTrigger
	} from '$lib/components/ui/dialog';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle,
		AlertDialogTrigger
	} from '$lib/components/ui/alert-dialog';
	import {
		Accordion,
		AccordionContent,
		AccordionItem,
		AccordionTrigger
	} from '$lib/components/ui/accordion';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';
	import { Info, XCircle } from 'lucide-svelte';

	// Form state
	let textValue = $state('');
	let emailValue = $state('');
	let passwordValue = $state('');
	let numberValue = $state(0);
	let textareaValue = $state('');
	let checkboxChecked = $state(false);
	let checkboxGroup = $state({
		option1: false,
		option2: false,
		option3: false
	});
	let radioValue = $state('option1');
	let switchValue = $state(false);
	let selectValue = $state<string>('');
	let dialogOpen = $state(false);
	let alertDialogOpen = $state(false);
	let progressValue = $state(33);
	let loadingButton = $state(false);

	// Select options
	const selectOptions = [
		{ value: 'option1', label: 'Option 1' },
		{ value: 'option2', label: 'Option 2' },
		{ value: 'option3', label: 'Option 3' }
	];

	// Get the label for the current select value
	let selectedLabel = $derived(
		selectValue
			? selectOptions.find((opt) => opt.value === selectValue)?.label || 'Select an option'
			: 'Select an option'
	);

	// Form submission
	function handleSubmit() {
		const formData = {
			text: textValue,
			email: emailValue,
			password: passwordValue,
			number: numberValue,
			textarea: textareaValue,
			checkbox: checkboxChecked,
			checkboxGroup,
			radio: radioValue,
			switch: switchValue,
			select: selectValue
		};
		console.log('Form submitted:', formData);
		toast.success('Form submitted successfully!');
	}

	// Button with loading state
	async function handleLoadingClick() {
		loadingButton = true;
		await new Promise((resolve) => setTimeout(resolve, 2000));
		loadingButton = false;
		toast.success('Action completed!');
	}
</script>

<svelte:head>
	<title>UI Components Showcase</title>
	<meta name="description" content="Interactive showcase of shadcn-svelte UI components" />
</svelte:head>

<div class="container py-8">
	<h1 class="mb-8 text-3xl font-bold">UI Components Showcase</h1>

	<!-- Form Controls Section -->
	<Card class="mb-8">
		<CardHeader>
			<CardTitle>Form Controls</CardTitle>
			<CardDescription>Interactive form elements with data-testid attributes</CardDescription>
		</CardHeader>
		<CardContent class="space-y-6">
			<!-- Text Inputs -->
			<div class="grid gap-4 md:grid-cols-2">
				<div class="space-y-2">
					<Label for="text-input">Text Input</Label>
					<Input
						id="text-input"
						data-testid="text-input"
						type="text"
						placeholder="Enter text"
						bind:value={textValue}
					/>
				</div>
				<div class="space-y-2">
					<Label for="email-input">Email Input</Label>
					<Input
						id="email-input"
						data-testid="email-input"
						type="email"
						placeholder="email@example.com"
						bind:value={emailValue}
					/>
				</div>
				<div class="space-y-2">
					<Label for="password-input">Password Input</Label>
					<Input
						id="password-input"
						data-testid="password-input"
						type="password"
						placeholder="Enter password"
						bind:value={passwordValue}
					/>
				</div>
				<div class="space-y-2">
					<Label for="number-input">Number Input</Label>
					<Input
						id="number-input"
						data-testid="number-input"
						type="number"
						placeholder="0"
						bind:value={numberValue}
					/>
				</div>
			</div>

			<!-- Textarea -->
			<div class="space-y-2">
				<Label for="textarea">Textarea</Label>
				<Textarea
					id="textarea"
					data-testid="textarea"
					placeholder="Enter long text..."
					bind:value={textareaValue}
				/>
			</div>

			<!-- Checkbox -->
			<div class="space-y-4">
				<div class="flex items-center space-x-2">
					<Checkbox
						id="single-checkbox"
						data-testid="single-checkbox"
						bind:checked={checkboxChecked}
					/>
					<Label for="single-checkbox">Single Checkbox {checkboxChecked ? '✓' : ''}</Label>
				</div>

				<!-- Checkbox Group -->
				<div class="space-y-2">
					<Label>Checkbox Group</Label>
					<div class="space-y-2">
						<div class="flex items-center space-x-2">
							<Checkbox
								id="checkbox-1"
								data-testid="checkbox-option1"
								bind:checked={checkboxGroup.option1}
							/>
							<Label for="checkbox-1">Option 1</Label>
						</div>
						<div class="flex items-center space-x-2">
							<Checkbox
								id="checkbox-2"
								data-testid="checkbox-option2"
								bind:checked={checkboxGroup.option2}
							/>
							<Label for="checkbox-2">Option 2</Label>
						</div>
						<div class="flex items-center space-x-2">
							<Checkbox
								id="checkbox-3"
								data-testid="checkbox-option3"
								bind:checked={checkboxGroup.option3}
							/>
							<Label for="checkbox-3">Option 3</Label>
						</div>
					</div>
				</div>
			</div>

			<!-- Radio Group -->
			<div class="space-y-2">
				<Label>Radio Group (Selected: {radioValue})</Label>
				<RadioGroup bind:value={radioValue} data-testid="radio-group">
					<div class="flex items-center space-x-2">
						<RadioGroupItem value="option1" id="radio-1" data-testid="radio-option1" />
						<Label for="radio-1">Radio Option 1</Label>
					</div>
					<div class="flex items-center space-x-2">
						<RadioGroupItem value="option2" id="radio-2" data-testid="radio-option2" />
						<Label for="radio-2">Radio Option 2</Label>
					</div>
					<div class="flex items-center space-x-2">
						<RadioGroupItem value="option3" id="radio-3" data-testid="radio-option3" />
						<Label for="radio-3">Radio Option 3</Label>
					</div>
				</RadioGroup>
			</div>

			<!-- Switch -->
			<div class="flex items-center space-x-2">
				<Switch id="switch" data-testid="switch" bind:checked={switchValue} />
				<Label for="switch">Toggle Switch ({switchValue ? 'On' : 'Off'})</Label>
			</div>

			<!-- Select/Dropdown -->
			<div class="space-y-2">
				<Label>Select Dropdown {selectValue ? `(${selectedLabel})` : ''}</Label>
				<Select.Root type="single" bind:value={selectValue}>
					<Select.Trigger data-testid="select-trigger">
						{selectedLabel}
					</Select.Trigger>
					<Select.Content>
						{#each selectOptions as option}
							<Select.Item
								value={option.value}
								label={option.label}
								data-testid={`select-${option.value}`}
							/>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<!-- Submit Button -->
			<Button data-testid="submit-button" onclick={handleSubmit} class="w-full">Submit Form</Button>
		</CardContent>
	</Card>

	<!-- Current Values Display -->
	<Card class="mb-8">
		<CardHeader>
			<CardTitle>Current Form Values</CardTitle>
			<CardDescription>Real-time display of all form control values</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="grid gap-2 text-sm">
				<div class="grid grid-cols-2 gap-2">
					<span class="font-medium">Text Input:</span>
					<span class="font-mono">{textValue || '(empty)'}</span>

					<span class="font-medium">Email Input:</span>
					<span class="font-mono">{emailValue || '(empty)'}</span>

					<span class="font-medium">Password Input:</span>
					<span class="font-mono"
						>{passwordValue ? '•'.repeat(passwordValue.length) : '(empty)'}</span
					>

					<span class="font-medium">Number Input:</span>
					<span class="font-mono">{numberValue}</span>

					<span class="font-medium">Textarea:</span>
					<span class="font-mono">{textareaValue || '(empty)'}</span>

					<span class="font-medium">Single Checkbox:</span>
					<span class="font-mono">{checkboxChecked ? 'Checked' : 'Unchecked'}</span>

					<span class="font-medium">Checkbox Group:</span>
					<span class="font-mono">
						{Object.entries(checkboxGroup)
							.filter(([_, checked]) => checked)
							.map(([key]) => key)
							.join(', ') || 'None selected'}
					</span>

					<span class="font-medium">Radio Selection:</span>
					<span class="font-mono">{radioValue}</span>

					<span class="font-medium">Switch State:</span>
					<span class="font-mono">{switchValue ? 'On' : 'Off'}</span>

					<span class="font-medium">Select Value:</span>
					<span class="font-mono"
						>{selectValue ? `${selectValue} (${selectedLabel})` : '(not selected)'}</span
					>
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Buttons & Actions Section -->
	<Card class="mb-8">
		<CardHeader>
			<CardTitle>Buttons & Actions</CardTitle>
			<CardDescription>Different button variants and states</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="flex flex-wrap gap-4">
				<Button data-testid="button-default">Default</Button>
				<Button data-testid="button-secondary" variant="secondary">Secondary</Button>
				<Button data-testid="button-destructive" variant="destructive">Destructive</Button>
				<Button data-testid="button-outline" variant="outline">Outline</Button>
				<Button data-testid="button-ghost" variant="ghost">Ghost</Button>
				<Button data-testid="button-link" variant="link">Link</Button>
			</div>
			<div class="flex gap-4">
				<Button data-testid="button-loading" onclick={handleLoadingClick} disabled={loadingButton}>
					{loadingButton ? 'Loading...' : 'Click for Loading State'}
				</Button>
				<Button data-testid="button-disabled" disabled>Disabled</Button>
			</div>
		</CardContent>
	</Card>

	<!-- Feedback Components Section -->
	<Card class="mb-8">
		<CardHeader>
			<CardTitle>Feedback Components</CardTitle>
			<CardDescription>Alerts, badges, progress, and notifications</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Alerts -->
			<Alert data-testid="alert-default">
				<Info class="h-4 w-4" />
				<AlertTitle>Default Alert</AlertTitle>
				<AlertDescription>This is a default alert message.</AlertDescription>
			</Alert>

			<Alert data-testid="alert-destructive" variant="destructive">
				<XCircle class="h-4 w-4" />
				<AlertTitle>Error Alert</AlertTitle>
				<AlertDescription>This is an error alert message.</AlertDescription>
			</Alert>

			<!-- Badges -->
			<div class="flex gap-2">
				<Badge data-testid="badge-default">Default</Badge>
				<Badge data-testid="badge-secondary" variant="secondary">Secondary</Badge>
				<Badge data-testid="badge-destructive" variant="destructive">Destructive</Badge>
				<Badge data-testid="badge-outline" variant="outline">Outline</Badge>
			</div>

			<!-- Progress -->
			<div class="space-y-2">
				<Label>Progress Bar ({progressValue}%)</Label>
				<Progress data-testid="progress-bar" value={progressValue} class="w-full" />
				<div class="flex gap-2">
					<Button
						data-testid="progress-decrease"
						size="sm"
						onclick={() => (progressValue = Math.max(0, progressValue - 10))}
					>
						-10%
					</Button>
					<Button
						data-testid="progress-increase"
						size="sm"
						onclick={() => (progressValue = Math.min(100, progressValue + 10))}
					>
						+10%
					</Button>
				</div>
			</div>

			<!-- Toast Triggers -->
			<div class="flex flex-wrap gap-2">
				<Button data-testid="toast-success" onclick={() => toast.success('Success message!')}>
					Success Toast
				</Button>
				<Button data-testid="toast-error" onclick={() => toast.error('Error message!')}>
					Error Toast
				</Button>
				<Button data-testid="toast-info" onclick={() => toast.info('Info message!')}>
					Info Toast
				</Button>
				<Button data-testid="toast-warning" onclick={() => toast.warning('Warning message!')}>
					Warning Toast
				</Button>
			</div>
		</CardContent>
	</Card>

	<!-- Overlays Section -->
	<Card class="mb-8">
		<CardHeader>
			<CardTitle>Overlays</CardTitle>
			<CardDescription>Dialogs, modals, and popups</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Dialog -->
			<Dialog bind:open={dialogOpen}>
				<DialogTrigger>
					<Button data-testid="dialog-trigger">Open Dialog</Button>
				</DialogTrigger>
				<DialogContent data-testid="dialog-content">
					<DialogHeader>
						<DialogTitle>Dialog Title</DialogTitle>
						<DialogDescription>This is a dialog description.</DialogDescription>
					</DialogHeader>
					<div class="py-4">
						<Label for="dialog-input">Dialog Input</Label>
						<Input id="dialog-input" data-testid="dialog-input" placeholder="Enter something..." />
					</div>
					<DialogFooter>
						<Button
							data-testid="dialog-cancel"
							variant="outline"
							onclick={() => (dialogOpen = false)}
						>
							Cancel
						</Button>
						<Button
							data-testid="dialog-confirm"
							onclick={() => {
								dialogOpen = false;
								toast.success('Dialog confirmed!');
							}}
						>
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<!-- Alert Dialog -->
			<AlertDialog bind:open={alertDialogOpen}>
				<AlertDialogTrigger>
					<Button data-testid="alert-dialog-trigger" variant="destructive">
						Open Alert Dialog
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent data-testid="alert-dialog-content">
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. This will permanently delete your data.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel data-testid="alert-dialog-cancel">Cancel</AlertDialogCancel>
						<AlertDialogAction
							data-testid="alert-dialog-confirm"
							onclick={() => {
								alertDialogOpen = false;
								toast.error('Action confirmed!');
							}}
						>
							Continue
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</CardContent>
	</Card>

	<!-- Data Display Section -->
	<Card class="mb-8">
		<CardHeader>
			<CardTitle>Data Display</CardTitle>
			<CardDescription>Table for displaying structured data</CardDescription>
		</CardHeader>
		<CardContent>
			<Table data-testid="data-table">
				<TableCaption>Sample user data table</TableCaption>
				<TableHeader>
					<TableRow>
						<TableHead>ID</TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Email</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Role</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<TableRow data-testid="table-row-1">
						<TableCell data-testid="table-cell-id-1">1</TableCell>
						<TableCell data-testid="table-cell-name-1">John Doe</TableCell>
						<TableCell data-testid="table-cell-email-1">john@example.com</TableCell>
						<TableCell data-testid="table-cell-status-1">Active</TableCell>
						<TableCell data-testid="table-cell-role-1">Admin</TableCell>
					</TableRow>
					<TableRow data-testid="table-row-2">
						<TableCell data-testid="table-cell-id-2">2</TableCell>
						<TableCell data-testid="table-cell-name-2">Jane Smith</TableCell>
						<TableCell data-testid="table-cell-email-2">jane@example.com</TableCell>
						<TableCell data-testid="table-cell-status-2">Active</TableCell>
						<TableCell data-testid="table-cell-role-2">User</TableCell>
					</TableRow>
					<TableRow data-testid="table-row-3">
						<TableCell data-testid="table-cell-id-3">3</TableCell>
						<TableCell data-testid="table-cell-name-3">Bob Johnson</TableCell>
						<TableCell data-testid="table-cell-email-3">bob@example.com</TableCell>
						<TableCell data-testid="table-cell-status-3">Inactive</TableCell>
						<TableCell data-testid="table-cell-role-3">User</TableCell>
					</TableRow>
					<TableRow data-testid="table-row-4">
						<TableCell data-testid="table-cell-id-4">4</TableCell>
						<TableCell data-testid="table-cell-name-4">Alice Cooper</TableCell>
						<TableCell data-testid="table-cell-email-4">alice@example.com</TableCell>
						<TableCell data-testid="table-cell-status-4">Active</TableCell>
						<TableCell data-testid="table-cell-role-4">Moderator</TableCell>
					</TableRow>
				</TableBody>
			</Table>
		</CardContent>
	</Card>

	<!-- Layout Components Section -->
	<Card class="mb-8">
		<CardHeader>
			<CardTitle>Layout Components</CardTitle>
			<CardDescription>Accordion, tabs, and cards</CardDescription>
		</CardHeader>
		<CardContent class="space-y-6">
			<!-- Accordion -->
			<Accordion type="single" class="w-full" data-testid="accordion">
				<AccordionItem value="item-1" data-testid="accordion-item-1">
					<AccordionTrigger data-testid="accordion-trigger-1">Accordion Item 1</AccordionTrigger>
					<AccordionContent data-testid="accordion-content-1">
						This is the content of accordion item 1.
					</AccordionContent>
				</AccordionItem>
				<AccordionItem value="item-2" data-testid="accordion-item-2">
					<AccordionTrigger data-testid="accordion-trigger-2">Accordion Item 2</AccordionTrigger>
					<AccordionContent data-testid="accordion-content-2">
						This is the content of accordion item 2.
					</AccordionContent>
				</AccordionItem>
				<AccordionItem value="item-3" data-testid="accordion-item-3">
					<AccordionTrigger data-testid="accordion-trigger-3">Accordion Item 3</AccordionTrigger>
					<AccordionContent data-testid="accordion-content-3">
						This is the content of accordion item 3.
					</AccordionContent>
				</AccordionItem>
			</Accordion>

			<!-- Tabs -->
			<Tabs value="tab1" class="w-full" data-testid="tabs">
				<TabsList class="grid w-full grid-cols-3">
					<TabsTrigger value="tab1" data-testid="tab-trigger-1">Tab 1</TabsTrigger>
					<TabsTrigger value="tab2" data-testid="tab-trigger-2">Tab 2</TabsTrigger>
					<TabsTrigger value="tab3" data-testid="tab-trigger-3">Tab 3</TabsTrigger>
				</TabsList>
				<TabsContent value="tab1" data-testid="tab-content-1">
					<Card>
						<CardHeader>
							<CardTitle>Tab 1 Content</CardTitle>
							<CardDescription>This is the content of tab 1.</CardDescription>
						</CardHeader>
					</Card>
				</TabsContent>
				<TabsContent value="tab2" data-testid="tab-content-2">
					<Card>
						<CardHeader>
							<CardTitle>Tab 2 Content</CardTitle>
							<CardDescription>This is the content of tab 2.</CardDescription>
						</CardHeader>
					</Card>
				</TabsContent>
				<TabsContent value="tab3" data-testid="tab-content-3">
					<Card>
						<CardHeader>
							<CardTitle>Tab 3 Content</CardTitle>
							<CardDescription>This is the content of tab 3.</CardDescription>
						</CardHeader>
					</Card>
				</TabsContent>
			</Tabs>
		</CardContent>
	</Card>
</div>

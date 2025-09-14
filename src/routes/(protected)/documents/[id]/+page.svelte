<script lang="ts">
	import DocumentEditor from '$lib/components/document-editor/DocumentEditor.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();
</script>

<DocumentEditor
	document={data.document}
	{form}
	showDelete={true}
	showBackButton={true}
	backUrl="/documents"
	deleteRedirect="/documents"
	class="h-full"
/>

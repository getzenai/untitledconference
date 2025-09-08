<script lang="ts">
	import DocumentEditor from '$lib/components/document-editor/DocumentEditor.svelte';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;
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

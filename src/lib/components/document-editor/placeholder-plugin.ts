import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

const placeholderKey = new PluginKey('documentEditorPlaceholder');

/**
 * Milkdown ships no placeholder plugin, so this replaces what TipTap's
 * Placeholder extension did: while the document is a single empty block, decorate
 * that block with `data-placeholder` and let CSS render it.
 */
export function placeholderPlugin(text: string) {
	return $prose(
		() =>
			new Plugin({
				key: placeholderKey,
				props: {
					decorations(state) {
						const { doc } = state;
						const firstChild = doc.firstChild;

						if (doc.childCount !== 1 || !firstChild || firstChild.content.size > 0) {
							return null;
						}

						return DecorationSet.create(doc, [
							Decoration.node(0, firstChild.nodeSize, {
								class: 'editor-placeholder',
								'data-placeholder': text
							})
						]);
					}
				}
			})
	);
}

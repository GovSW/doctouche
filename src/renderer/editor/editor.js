import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { DOMParser } from 'prosemirror-model';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, setBlockType, wrapIn } from 'prosemirror-commands';
import { wrapInList, splitListItem } from 'prosemirror-schema-list';
import { docSchema } from './schema.js';

export function createEditor(mountEl, { initialHTML = '<p></p>', onChange } = {}) {
  const container = document.createElement('div');
  container.innerHTML = initialHTML;
  const doc = DOMParser.fromSchema(docSchema).parse(container);

  const state = EditorState.create({
    doc,
    schema: docSchema,
    plugins: [
      history(),
      keymap({
        'Mod-z': undo,
        'Mod-y': redo,
        'Mod-b': toggleMark(docSchema.marks.strong),
        'Mod-i': toggleMark(docSchema.marks.em),
        'Mod-u': toggleMark(docSchema.marks.underline),
        'Enter': splitListItem(docSchema.nodes.list_item)
      }),
      keymap(baseKeymap)
    ]
  });

  const view = new EditorView(mountEl, {
    state,
    dispatchTransaction(tr) {
      const newState = view.state.apply(tr);
      view.updateState(newState);
      if (onChange) onChange(newState);
    }
  });

  return view;
}

function setAlign(view, align) {
  const { state, dispatch } = view;
  const { $from } = state.selection;
  const pos = $from.before($from.depth);
  const node = state.doc.nodeAt(pos);
  if (!node) return;
  dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, align }));
}

// ─── Comandi esposti alla ribbon ───────────────────────────────────────────
export const commands = {
  bold: (view) => toggleMark(docSchema.marks.strong)(view.state, view.dispatch),
  italic: (view) => toggleMark(docSchema.marks.em)(view.state, view.dispatch),
  underline: (view) => toggleMark(docSchema.marks.underline)(view.state, view.dispatch),
  bulletList: (view) => wrapInList(docSchema.nodes.bullet_list)(view.state, view.dispatch),
  orderedList: (view) => wrapInList(docSchema.nodes.ordered_list)(view.state, view.dispatch),
  heading1: (view) => setBlockType(docSchema.nodes.heading, { level: 1 })(view.state, view.dispatch),
  heading2: (view) => setBlockType(docSchema.nodes.heading, { level: 2 })(view.state, view.dispatch),
  heading3: (view) => setBlockType(docSchema.nodes.heading, { level: 3 })(view.state, view.dispatch),
  paragraph: (view) => setBlockType(docSchema.nodes.paragraph)(view.state, view.dispatch),
  blockquote: (view) => wrapIn(docSchema.nodes.blockquote)(view.state, view.dispatch),

  insertTable: (view) => {
    const { state, dispatch } = view;
    const rows = 3, cols = 3;
    const cell = () => docSchema.nodes.table_cell.createAndFill();
    const row = () => docSchema.nodes.table_row.create(null, Array.from({ length: cols }, cell));
    const table = docSchema.nodes.table.create(null, Array.from({ length: rows }, row));
    dispatch(state.tr.replaceSelectionWith(table));
  },

  insertLine: (view) => {
    const { state, dispatch } = view;
    dispatch(state.tr.replaceSelectionWith(docSchema.nodes.horizontal_rule.create()));
  },

  alignLeft: (view) => setAlign(view, 'left'),
  alignCenter: (view) => setAlign(view, 'center'),
  alignRight: (view) => setAlign(view, 'right'),
  alignJustify: (view) => setAlign(view, 'justify'),

  insertCrossRef: (view, { refId, label }) => {
    const { state, dispatch } = view;
    const mark = docSchema.marks.crossRef.create({ refId, label });
    const tr = state.tr.addMark(state.selection.from, state.selection.to, mark);
    dispatch(tr);
  }
};

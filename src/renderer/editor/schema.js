import { Schema } from 'prosemirror-model';
import { schema as basic } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { tableNodes } from 'prosemirror-tables';

// Nodi base di prosemirror-schema-basic + liste + tabelle,
// più marks aggiuntivi (sottolineato, colore, font, dimensione) per parità con Word.

let baseNodes = addListNodes(basic.spec.nodes, 'paragraph block*', 'block').append(
  tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {} })
);

// Aggiunge l'attributo "align" a paragraph e heading, per l'allineamento reale
// (sinistra/centro/destra/giustificato), applicato anche in export DOCX/PDF.
['paragraph', 'heading'].forEach(name => {
  const spec = baseNodes.get(name);
  baseNodes = baseNodes.update(name, {
    ...spec,
    attrs: { ...spec.attrs, align: { default: 'left' } },
    parseDOM: (spec.parseDOM || []).map(rule => ({
      ...rule,
      getAttrs: dom => ({
        ...(rule.getAttrs ? rule.getAttrs(dom) : {}),
        align: dom.style?.textAlign || 'left'
      })
    })),
    toDOM: node => [name === 'heading' ? `h${node.attrs.level}` : 'p',
      { style: `text-align:${node.attrs.align}` }, 0]
  });
});

const nodes = baseNodes;

const marks = basic.spec.marks.addToEnd('underline', {
  parseDOM: [{ tag: 'u' }],
  toDOM: () => ['u', 0]
}).addToEnd('textColor', {
  attrs: { color: { default: '#000000' } },
  parseDOM: [{ style: 'color', getAttrs: value => ({ color: value }) }],
  toDOM: mark => ['span', { style: `color:${mark.attrs.color}` }, 0]
}).addToEnd('fontFamily', {
  attrs: { family: { default: 'Calibri' } },
  toDOM: mark => ['span', { style: `font-family:${mark.attrs.family}` }, 0]
}).addToEnd('fontSize', {
  attrs: { size: { default: '12' } },
  toDOM: mark => ['span', { style: `font-size:${mark.attrs.size}pt` }, 0]
}).addToEnd('crossRef', {
  attrs: { refId: {}, label: {} },
  toDOM: mark => ['a', { class: 'cross-ref', 'data-ref-id': mark.attrs.refId, title: mark.attrs.label }, 0]
});

export const docSchema = new Schema({ nodes, marks });

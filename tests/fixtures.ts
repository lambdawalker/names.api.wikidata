export const entity = {
  id: 'Q100', type: 'item', lastrevid: 123, modified: '2026-10-27T00:00:00Z',
  labels: { en: { language: 'en', value: 'Example Person' } }, descriptions: {}, aliases: {}, sitelinks: {},
  claims: {
    P31: [{ id: 'Q100$human', type: 'statement', rank: 'normal', mainsnak: { snaktype: 'value', property: 'P31', datavalue: { type: 'wikibase-entityid', value: { id: 'Q5', 'entity-type': 'item', 'numeric-id': 5 } } } }],
    P735: [{ id: 'Q100$name', type: 'statement', rank: 'normal', mainsnak: { snaktype: 'value', property: 'P735', datatype: 'wikibase-item', datavalue: { type: 'wikibase-entityid', value: { id: 'Q4925477', 'entity-type': 'item' } } }, qualifiers: { P1545: [{ snaktype: 'value', property: 'P1545', datavalue: { type: 'string', value: '1' } }] }, references: [{ hash: 'refhash', snaks: { P248: [{ snaktype: 'value', property: 'P248', datavalue: { type: 'wikibase-entityid', value: { id: 'Q200' } } }] }, 'snaks-order': ['P248'] }] }],
    P999: [{ id: 'Q100$unknown', type: 'statement', rank: 'deprecated', mainsnak: { snaktype: 'novalue', property: 'P999' } }],
  }, future: { preserved: true },
};
export const userAgent = 'NamesTest/1 (https://example.org/contact)';

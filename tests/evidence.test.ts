import { expect, it } from 'vitest';
import { toDocumentInput, toBearerFinding } from '../src/evidence.js';
import { entity } from './fixtures.js';
const record = () => ({ source: 'wikidata', locator: 'https://www.wikidata.org/w/index.php?title=Q100&oldid=123', retrievedAt: '2026-10-27T00:00:00Z', revision: '123', data: structuredClone(entity) });
const options = { nameEntityId: 'Q4925477', kind: 'given_name' as const, formIds: ['form-john'] };
it('creates deterministic CC0 Markdown snapshots with observation identities and preserved claims', () => {
  const doc = toDocumentInput(record()); expect(doc).toEqual(toDocumentInput(record()));
  expect(doc.source).toMatchObject({ revision: '123', license: { name: 'CC0 1.0' }, public_reuse: 'allowed' });
  expect(doc.content).toContain('"qualifiers"'); expect(doc.content).toContain('"references"');
  expect(toDocumentInput({ ...record(), retrievedAt: '2026-10-27T01:00:00Z' }).source.id).not.toBe(doc.source.id);
  const r = record(); r.data.labels.en.value = '``` injected'; expect(toDocumentInput(r).content).toContain('````json');
});
it('creates only a candidate bearer claim linked to a current matching statement and supplied forms', () => {
  const finding = toBearerFinding(record(), options);
  expect(finding.notable_bearers[0]).toMatchObject({ name: 'Example Person', wikidata_id: 'Q100', form_ids: ['form-john'], status: 'candidate' });
  expect(finding.evidence[0]?.supporting_text).toContain('Q100$name'); expect(finding.evidence[0]?.supporting_text).toContain('refhash');
  expect(finding.evidence[0]?.supporting_text).toContain('P1545');
  expect(finding.sources[0]?.id).toBe(toDocumentInput(record()).source.id);
});
it('does not promote deprecated, unknown-value, superseded or wrong-name statements', () => {
  const changed = record(); changed.data.claims.P735[0]!.rank = 'deprecated'; expect(() => toBearerFinding(changed, options)).toThrow(/matching/i);
  const preferred = record(); preferred.data.claims.P735.push({ ...preferred.data.claims.P735[0]!, id: 'Q100$preferred', rank: 'preferred', mainsnak: { ...preferred.data.claims.P735[0]!.mainsnak, datavalue: { type: 'wikibase-entityid', value: { id: 'Q999', 'entity-type': 'item' } } } });
  expect(() => toBearerFinding(preferred, options)).toThrow(/matching/i);
  expect(() => toBearerFinding(record(), { ...options, nameEntityId: 'Q999' })).toThrow(/matching/i);
  expect(() => toBearerFinding(record(), { ...options, formIds: [] })).toThrow();
});
it('refuses source revision mismatches and entities without a requested display label', () => {
  expect(() => toDocumentInput({ ...record(), revision: '124' })).toThrow(/revision/i);
  expect(() => toBearerFinding(record(), { ...options, labelLanguage: 'es' })).toThrow(/label/i);
});
it('requires value snaks for both the human classification and name proof', () => {
  const base = record();
  for (const key of ['P31', 'P735'] as const) for (const snaktype of ['novalue', 'somevalue']) {
    const r = { ...base, data: { ...base.data, claims: { ...base.data.claims, [key]: [{ ...base.data.claims[key][0], mainsnak: { snaktype, property: key } }] } } };
    expect(() => toBearerFinding(r, options)).toThrow(/matching/i);
  }
});
it('rejects incoherent statement/property identity in directly supplied records', () => {
  const r = record(); r.data.claims.P735[0]!.mainsnak.property = 'P31';
  expect(() => toBearerFinding(r, options)).toThrow(/identity/i);
});
it('rejects contradictory known item-reference metadata in human and name proof', () => {
  for (const key of ['P31', 'P735'] as const) {
    const base = record(); const statement = base.data.claims[key][0]!;
    for (const value of [{ ...statement.mainsnak.datavalue.value, 'entity-type': 'property' }, { ...statement.mainsnak.datavalue.value, 'numeric-id': 999 }, { ...statement.mainsnak.datavalue.value, 'numeric-id': Number.MAX_SAFE_INTEGER + 1 }]) {
      const r = { ...base, data: { ...base.data, claims: { ...base.data.claims, [key]: [{ ...statement, mainsnak: { ...statement.mainsnak, datavalue: { type: 'wikibase-entityid', value } } }] } } };
      expect(() => toBearerFinding(r, options)).toThrow(/reference/i);
    }
    const badDatatype = { ...base, data: { ...base.data, claims: { ...base.data.claims, [key]: [{ ...statement, mainsnak: { ...statement.mainsnak, datatype: 'wikibase-property' } }] } } };
    expect(() => toBearerFinding(badDatatype, options)).toThrow(/reference/i);
  }
});
it('rejects mismatched language metadata in labels, descriptions and aliases', () => {
  for (const field of ['labels', 'descriptions', 'aliases']) {
    const base = record(); const foreign = { language: 'fr', value: 'French value' };
    const r = { ...base, data: { ...base.data, [field]: { en: field === 'aliases' ? [foreign] : foreign } } };
    expect(() => toBearerFinding(r, options)).toThrow(/language/i);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {searchLocation, submittedSearch} from '../../../src/core/features/search/ui/workspace/searchLocation';
import {emptyRefinements} from '../../../src/core/features/search/ui/workspace/SearchRefinements';

test('unsubmitted search stays distinct from an explicitly empty search', () => {
  assert.equal(searchLocation('').submitted, undefined);
  assert.equal(searchLocation('?q=').submitted, '');
});

test('submitted search round-trips text and every available refinement', () => {
  const refinements = {containerId:'space/1', contributorId:'member+2', status:'Needs review', updatedFrom:'2026-10-01', updatedTo:'2026-10-02', includeTrashed:true};
  const query = 'R&D / escalation + owner?';
  const restored = searchLocation(`?${submittedSearch(query, 'page', true, refinements)}`);
  assert.deepEqual(restored, {query, submitted:query, kind:'page', archived:true, refinements});
});

test('cleared filters omit false values and restoration ignores result or authority fields', () => {
  assert.equal(submittedSearch('guide', '', false, emptyRefinements), 'q=guide');
  assert.deepEqual(searchLocation('?q=guide&isAdmin=true&results=private&includeArchived=false').refinements, emptyRefinements);
  assert.equal(searchLocation('?q=guide&includeArchived=false').archived, false);
  assert.equal('isAdmin' in searchLocation('?q=guide&isAdmin=true'), false);
});

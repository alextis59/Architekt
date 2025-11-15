import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyDomainAggregate } from '@architekt/domain';
import { createMemoryPersistence } from './memoryPersistence.js';

test('load returns empty aggregate for unknown users', async () => {
  const persistence = createMemoryPersistence();
  const aggregate = await persistence.load('missing-user');
  assert.deepEqual(aggregate, createEmptyDomainAggregate());
});

test('initial data containing a single aggregate is scoped to local user', async () => {
  const initial = {
    projects: {
      'proj-1': {
        id: 'proj-1',
        name: 'Demo',
        description: '',
        tags: [],
        rootSystemId: 'sys-1',
        systems: {},
        flows: {},
        dataModels: {},
        components: {}
      }
    }
  };

  const persistence = createMemoryPersistence(initial);
  const aggregate = await persistence.load('local-user');
  assert.equal(Object.keys(aggregate.projects).length, 1);
  assert.equal(aggregate.projects['proj-1']?.id, 'proj-1');

  const otherUserAggregate = await persistence.load('someone-else');
  assert.deepEqual(otherUserAggregate, createEmptyDomainAggregate());
});

test('initial store drops invalid user entries and keeps valid aggregates', async () => {
  const validAggregate = { projects: {} };
  const persistence = createMemoryPersistence({
    'first-user': validAggregate,
    'second-user': { invalid: true },
    third: 'not-an-aggregate'
  });

  const aggregate = await persistence.load('first-user');
  assert.deepEqual(aggregate, createEmptyDomainAggregate());

  const missing = await persistence.load('second-user');
  assert.deepEqual(missing, createEmptyDomainAggregate());
});

test('save validates aggregates and keeps users isolated', async () => {
  const persistence = createMemoryPersistence();
  const empty = createEmptyDomainAggregate();

  await persistence.save('user-a', empty);
  const stored = await persistence.load('user-a');
  assert.deepEqual(stored, empty);

  await persistence.save('user-b', null as unknown as typeof empty);
  const userAAggregate = await persistence.load('user-a');
  assert.deepEqual(userAAggregate, empty);
  const userBAggregate = await persistence.load('user-b');
  assert.deepEqual(userBAggregate, createEmptyDomainAggregate());
});

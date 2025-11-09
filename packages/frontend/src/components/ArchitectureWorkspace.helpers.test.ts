import type { Project } from '@architekt/domain';
import { describe, expect, it } from 'vitest';
import { buildFilteredTree, collectProjectTags } from './ArchitectureWorkspace.js';

const project: Project = {
  id: 'proj-1',
  name: 'Demo Project',
  description: 'Synthetic data for tests',
  tags: ['platform', 'service'],
  rootSystemId: 'sys-1',
  systems: {
    'sys-1': {
      id: 'sys-1',
      name: 'Root System',
      description: 'Entry point',
      tags: ['core'],
      childIds: ['sys-2', 'sys-3'],
      isRoot: true
    },
    'sys-2': {
      id: 'sys-2',
      name: 'API Gateway',
      description: 'Proxy layer',
      tags: ['edge', 'core'],
      childIds: [],
      isRoot: false
    },
    'sys-3': {
      id: 'sys-3',
      name: 'Analytics Engine',
      description: 'Reporting pipeline',
      tags: ['analytics'],
      childIds: [],
      isRoot: false
    }
  },
  flows: {}
};

describe('collectProjectTags', () => {
  it('deduplicates and sorts project tags alphabetically', () => {
    const tags = collectProjectTags(project);
    expect(tags).toEqual(['analytics', 'core', 'edge']);
  });
});

describe('buildFilteredTree', () => {
  it('returns the entire hierarchy when no tags are active', () => {
    const tree = buildFilteredTree(project, []);
    expect(tree).not.toBeNull();
    expect(tree?.children).toHaveLength(2);
  });

  it('retains ancestors for matching descendants', () => {
    const tree = buildFilteredTree(project, ['analytics']);
    expect(tree).not.toBeNull();
    expect(tree?.children).toHaveLength(1);
    expect(tree?.children[0]?.system.id).toBe('sys-3');
    expect(tree?.children[0]?.isMatch).toBe(true);
  });

  it('filters out branches without tag matches', () => {
    const tree = buildFilteredTree(project, ['edge']);
    expect(tree).not.toBeNull();
    expect(tree?.children).toHaveLength(1);
    expect(tree?.children[0]?.system.id).toBe('sys-2');
  });
});


import type { System } from '@architekt/domain';
import { Tree, hierarchy, type HierarchyPointNode } from '@visx/hierarchy';
import { ParentSize } from '@visx/responsive';
import clsx from 'clsx';
import { Fragment } from 'react';

export type FilteredTreeNode = {
  system: System;
  children: FilteredTreeNode[];
  isMatch: boolean;
  isVisible: boolean;
};

type SystemTreeProps = {
  tree: FilteredTreeNode;
  selectedSystemId: string | null;
  onSelectSystem: (systemId: string) => void;
  isFiltered: boolean;
};

const NODE_RADIUS = 18;
const HORIZONTAL_SPACING = 140;
const VERTICAL_SPACING = 80;

const renderLinkPath = (link: { source: HierarchyPointNode<FilteredTreeNode>; target: HierarchyPointNode<FilteredTreeNode> }) => {
  const x0 = link.source.x;
  const y0 = link.source.y;
  const x1 = link.target.x;
  const y1 = link.target.y;

  const midpoint = (y0 + y1) / 2;

  return `M${y0},${x0}C${midpoint},${x0} ${midpoint},${x1} ${y1},${x1}`;
};

const SystemTree = ({ tree, selectedSystemId, onSelectSystem, isFiltered }: SystemTreeProps) => (
  <div className="system-tree" role="tree">
    <ParentSize debounceTime={100}>
      {({ width, height }) => {
        const safeWidth = Math.max(width, 320);
        const safeHeight = Math.max(height, 360);
        const root = hierarchy(tree);

        return (
          <svg width={safeWidth} height={safeHeight} aria-hidden>
            <Tree
              root={root}
              size={[safeHeight - VERTICAL_SPACING, safeWidth - HORIZONTAL_SPACING]}
              separation={(a, b) => (a.parent === b.parent ? 1 : 1.2)}
            >
              {(treeData) => (
                <g transform={`translate(${HORIZONTAL_SPACING / 2},${VERTICAL_SPACING / 2})`}>
                  {treeData.links().map((link, index) => (
                    <path key={index} d={renderLinkPath(link)} className="tree-link" />
                  ))}
                  {treeData.descendants().map((node) => {
                    const { system, isMatch } = node.data;
                    const selected = system.id === selectedSystemId;
                    const showMatchHighlight = isFiltered && isMatch;

                    return (
                      <Fragment key={system.id}>
                        <g
                          className={clsx('tree-node', {
                            selected,
                            match: showMatchHighlight
                          })}
                          transform={`translate(${node.y},${node.x})`}
                        >
                          <circle
                            r={NODE_RADIUS}
                            onClick={() => onSelectSystem(system.id)}
                            role="treeitem"
                            aria-selected={selected}
                          />
                          <text
                            dy="0.35em"
                            x={NODE_RADIUS + 12}
                            onClick={() => onSelectSystem(system.id)}
                          >
                            {system.name}
                          </text>
                        </g>
                      </Fragment>
                    );
                  })}
                </g>
              )}
            </Tree>
          </svg>
        );
      }}
    </ParentSize>
  </div>
);

export default SystemTree;


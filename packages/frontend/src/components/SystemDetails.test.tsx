import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { System } from '@architekt/domain';
import { describe, expect, it, vi } from 'vitest';
import SystemDetails from './SystemDetails.js';

const baseSystem: System = {
  id: 'sys-1',
  name: 'API Gateway',
  description: 'Edge routing layer',
  tags: ['edge', 'api'],
  childIds: [],
  isRoot: false
};

describe('SystemDetails', () => {
  it('disables the delete action for the root system', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <SystemDetails
        system={{ ...baseSystem, isRoot: true }}
        isRoot
        onUpdate={vi.fn()}
        onCreateChild={vi.fn()}
        onDelete={onDelete}
        isMutating={false}
        errorMessage={null}
      />
    );

    expect(
      screen.getByText('Root system anchors the entire architecture and cannot be removed.')
    ).toBeInTheDocument();

    const deleteButton = screen.getByRole('button', { name: 'Delete system' });
    expect(deleteButton).toBeDisabled();
    await user.click(deleteButton);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('submits trimmed updates with sanitized tags', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();

    render(
      <SystemDetails
        system={baseSystem}
        isRoot={false}
        onUpdate={onUpdate}
        onCreateChild={vi.fn()}
        onDelete={vi.fn()}
        isMutating={false}
        errorMessage={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Edit system' }));

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, '  API Platform  ');

    const descriptionInput = screen.getByLabelText('Description');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, '  Handles traffic   ');

    const tagsInput = screen.getByLabelText('Tags');
    await user.clear(tagsInput);
    await user.type(tagsInput, ' edge , platform , edge , api  ');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onUpdate).toHaveBeenCalledWith({
      name: 'API Platform',
      description: 'Handles traffic',
      tags: ['edge', 'platform', 'api']
    });
  });

  it('creates child systems with parsed metadata', async () => {
    const user = userEvent.setup();
    const onCreateChild = vi.fn();

    render(
      <SystemDetails
        system={baseSystem}
        isRoot={false}
        onUpdate={vi.fn()}
        onCreateChild={onCreateChild}
        onDelete={vi.fn()}
        isMutating={false}
        errorMessage={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add child system' }));

    const childNameInput = screen.getByLabelText('Name');
    await user.type(childNameInput, '  Queue Worker ');

    const childDescriptionInput = screen.getByLabelText('Description');
    await user.type(childDescriptionInput, '  Processes tasks  ');

    const childTagsInput = screen.getByLabelText('Tags');
    await user.type(childTagsInput, ' queue , worker , queue ');

    await user.click(screen.getByRole('button', { name: 'Create child' }));

    expect(onCreateChild).toHaveBeenCalledWith({
      name: 'Queue Worker',
      description: 'Processes tasks',
      tags: ['queue', 'worker']
    });
  });

  it('invokes delete handler for non-root systems and surfaces errors', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <SystemDetails
        system={baseSystem}
        isRoot={false}
        onUpdate={vi.fn()}
        onCreateChild={vi.fn()}
        onDelete={onDelete}
        isMutating={false}
        errorMessage="Unable to delete system"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Delete system' }));
    expect(onDelete).toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to delete system');
  });
});

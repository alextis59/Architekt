import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TagFilterBar from './TagFilterBar.js';

describe('TagFilterBar', () => {
  it('renders empty state when no tags are available', () => {
    render(<TagFilterBar availableTags={[]} selectedTags={[]} onToggleTag={vi.fn()} onClear={vi.fn()} />);

    expect(screen.getByRole('toolbar')).toHaveTextContent(/No tags defined yet/i);
  });

  it('toggles tags and clears selection', async () => {
    const onToggleTag = vi.fn();
    const onClear = vi.fn();
    const user = userEvent.setup();

    render(
      <TagFilterBar
        availableTags={['alpha', 'beta']}
        selectedTags={['beta']}
        onToggleTag={onToggleTag}
        onClear={onClear}
        label="Filter"
      />
    );

    expect(screen.getByRole('toolbar', { name: /filter/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'alpha' }));
    expect(onToggleTag).toHaveBeenCalledWith('alpha');

    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(onClear).toHaveBeenCalled();
  });
});

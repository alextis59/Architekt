import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ComponentProps, useState } from 'react';
import TagEditor from './TagEditor.js';

type TagEditorComponentProps = ComponentProps<typeof TagEditor>;

const TagEditorHarness = ({
  initialTags = [],
  ...props
}: Omit<TagEditorComponentProps, 'tags' | 'onChange'> & { initialTags?: string[] }) => {
  const [tags, setTags] = useState<string[]>(initialTags);

  return (
    <TagEditor
      {...props}
      tags={tags}
      onChange={setTags}
      placeholder="Add tag"
    />
  );
};

describe('TagEditor shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('surfaces the last three tags for the same view', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <MemoryRouter>
        <TagEditorHarness viewId="flows" />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText('Add tag');

    await user.type(input, 'alpha{enter}');
    await user.type(input, 'beta{enter}');
    await user.type(input, 'gamma{enter}');
    await user.type(input, 'delta{enter}');

    rerender(
      <MemoryRouter>
        <TagEditorHarness key="second-instance" viewId="flows" initialTags={[]} />
      </MemoryRouter>
    );

    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delta$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^gamma$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^beta$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^alpha$/ })).not.toBeInTheDocument();
  });

  it('does not show shortcuts when they are disabled', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <TagEditorHarness viewId="constraints" enableShortcuts={false} />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText('Add tag');
    await user.type(input, 'alpha{enter}');

    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });
});

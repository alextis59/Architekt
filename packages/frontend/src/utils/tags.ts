export const normalizeTags = (tags: string[]): string[] => {
  const result = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed) {
      result.add(trimmed);
    }
  }
  return [...result];
};

export const parseTagInput = (input: string): string[] =>
  normalizeTags(input.split(',').map((tag) => tag.trim()));

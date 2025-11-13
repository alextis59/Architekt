let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export const setAuthToken = (token: string | null): void => {
  authToken = token;
};

export const getAuthToken = (): string | null => authToken;

export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  unauthorizedHandler = handler;
};

export const notifyUnauthorized = (): void => {
  if (unauthorizedHandler) {
    unauthorizedHandler();
  }
};

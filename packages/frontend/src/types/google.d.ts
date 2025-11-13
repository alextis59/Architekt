declare global {
  namespace google {
    namespace accounts {
      namespace id {
        type CredentialResponse = {
          credential?: string;
        };

        type IdConfiguration = {
          client_id: string;
          callback: (response: CredentialResponse) => void;
        };
      }

      const id: {
        initialize: (config: id.IdConfiguration) => void;
        renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        prompt: () => void;
        disableAutoSelect: () => void;
        cancel: () => void;
      };
    }
  }

  interface Window {
    google?: typeof google;
  }
}

export {};


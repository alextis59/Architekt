export type EntryPointSelectOption = {
  value: string;
  label: string;
};

export type EntryPointFormConfig = {
  allowedProtocols: string[];
  allowedMethods: string[];
  showProtocol: boolean;
  showMethod: boolean;
  showPath: boolean;
  showFunctionName: boolean;
};

export const ENTRY_POINT_TYPE_OPTIONS: EntryPointSelectOption[] = [
  { value: 'http', label: 'HTTP request' },
  { value: 'queue', label: 'Queue listener' },
  { value: 'event', label: 'Event subscription' },
  { value: 'cron', label: 'Scheduled job' },
  { value: 'stream', label: 'Stream processor' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'firebase-function', label: 'Firebase function' }
];

export const ENTRY_POINT_PROTOCOL_OPTIONS: EntryPointSelectOption[] = [
  { value: 'HTTP', label: 'HTTP' },
  { value: 'http/2', label: 'HTTP/2' },
  { value: 'HTTPS', label: 'HTTPS' },
  { value: 'gRPC', label: 'gRPC' },
  { value: 'GraphQL', label: 'GraphQL' },
  { value: 'AMQP', label: 'AMQP' },
  { value: 'Kafka', label: 'Kafka' },
  { value: 'MQTT', label: 'MQTT' },
  { value: 'WebSocket', label: 'WebSocket' }
];

export const ENTRY_POINT_METHOD_OPTIONS: EntryPointSelectOption[] = [
  { value: 'get', label: 'GET' },
  { value: 'post', label: 'POST' },
  { value: 'put', label: 'PUT' },
  { value: 'patch', label: 'PATCH' },
  { value: 'delete', label: 'DELETE' },
  { value: 'options', label: 'OPTIONS' },
  { value: 'head', label: 'HEAD' },
  { value: 'connect', label: 'CONNECT' },
  { value: 'trace', label: 'TRACE' },
  { value: 'publish', label: 'PUBLISH' },
  { value: 'subscribe', label: 'SUBSCRIBE' },
  { value: 'listen', label: 'LISTEN' },
  { value: 'schedule', label: 'SCHEDULE' },
  { value: 'trigger', label: 'TRIGGER' }
];

export const ENTRY_POINT_TYPE_CONFIG: Record<string, Partial<EntryPointFormConfig>> = {
  http: {
    allowedProtocols: ['HTTP', 'http/2', 'HTTPS', 'gRPC', 'GraphQL', 'WebSocket'],
    allowedMethods: ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'connect', 'trace'],
    showProtocol: true,
    showMethod: true,
    showPath: true
  },
  webhook: {
    allowedProtocols: ['HTTP', 'HTTPS'],
    allowedMethods: ['post', 'put', 'patch'],
    showProtocol: true,
    showMethod: true,
    showPath: true
  },
  queue: {
    allowedProtocols: ['AMQP', 'Kafka', 'MQTT'],
    allowedMethods: ['publish', 'subscribe', 'listen'],
    showProtocol: true,
    showMethod: true,
    showPath: true
  },
  event: {
    allowedProtocols: ['HTTP', 'HTTPS', 'WebSocket', 'GraphQL'],
    allowedMethods: ['subscribe', 'trigger'],
    showProtocol: true,
    showMethod: true,
    showPath: true
  },
  stream: {
    allowedProtocols: ['Kafka', 'MQTT', 'WebSocket'],
    allowedMethods: ['listen', 'subscribe'],
    showProtocol: true,
    showMethod: true,
    showPath: true
  },
  cron: {
    allowedProtocols: [],
    allowedMethods: ['schedule', 'trigger'],
    showProtocol: false,
    showMethod: true,
    showPath: false
  },
  'firebase-function': {
    allowedProtocols: [],
    allowedMethods: [],
    showProtocol: false,
    showMethod: false,
    showPath: false,
    showFunctionName: true
  }
};

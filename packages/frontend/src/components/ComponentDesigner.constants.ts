export type EntryPointSelectOption = {
  value: string;
  label: string;
};

export const ENTRY_POINT_TYPE_OPTIONS: EntryPointSelectOption[] = [
  { value: 'http', label: 'HTTP request' },
  { value: 'queue', label: 'Queue listener' },
  { value: 'event', label: 'Event subscription' },
  { value: 'cron', label: 'Scheduled job' },
  { value: 'stream', label: 'Stream processor' },
  { value: 'webhook', label: 'Webhook' }
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

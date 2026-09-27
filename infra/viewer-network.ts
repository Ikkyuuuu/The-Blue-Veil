// The viewer cannot choose this value: always replace even duplicate headers.
// It is forwarded only on the uncached API behavior with private origin-token checks.
export const VIEWER_NETWORK_CODE = `function handler(event) {
  var request = event.request;
  request.headers['x-blue-veil-network'] = { value: event.viewer.ip };
  return request;
}`;

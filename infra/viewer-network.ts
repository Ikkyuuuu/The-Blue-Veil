// The viewer cannot choose this value: always replace even duplicate headers.
// It is forwarded only on the uncached API behavior behind signed origin access.
export const VIEWER_NETWORK_CODE = `function handler(event) {
  var request = event.request;
  request.headers['x-blue-veil-network'] = { value: event.viewer.ip };
  return request;
}`;

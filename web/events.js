// openEvents() stands in for new EventSource('/events'): the same onopen / onmessage / onerror,
// but every page in the browser shares one connection through events-worker.js.
function openEvents() {
  const source = { onopen: null, onmessage: null, onerror: null };
  if (!window.SharedWorker) {
    const es = new EventSource('/events');
    es.onopen = (e) => source.onopen && source.onopen(e);
    es.onerror = (e) => source.onerror && source.onerror(e);
    es.onmessage = (m) => source.onmessage && source.onmessage(m);
    return source;
  }
  const worker = new SharedWorker('/events-worker.js');
  worker.port.onmessage = (m) => {
    const d = m.data;
    if (d.kind === 'open') source.onopen && source.onopen();
    else if (d.kind === 'error') source.onerror && source.onerror();
    else source.onmessage && source.onmessage({ data: JSON.stringify(d.ev) });
  };
  worker.port.start();
  return source;
}

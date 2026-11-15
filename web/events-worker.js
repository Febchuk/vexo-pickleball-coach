// One connection to the coach for every open page.
//
// Chrome allows six connections per host, and each page's event stream holds one open for good, so
// a seventh tab never loads. This shared worker keeps a single /events stream and fans it out to
// every page, replaying what a late page missed the same way the server does.

const ports = new Set();
let log = [];
let stream = null;
let open = false;

function send(port, message) {
  try {
    port.postMessage(message);
  } catch {
    ports.delete(port);
  }
}

function start() {
  stream = new EventSource('/events');
  stream.onopen = () => {
    log = [];
    open = true;
    for (const p of ports) send(p, { kind: 'open' });
  };
  stream.onerror = () => {
    open = false;
    for (const p of ports) send(p, { kind: 'error' });
  };
  stream.onmessage = (m) => {
    const ev = JSON.parse(m.data);
    if (ev.type === 'status') log = log.filter((e) => e.type !== 'status');
    log.push(ev);
    for (const p of ports) send(p, { kind: 'event', ev });
  };
}

onconnect = (e) => {
  const port = e.ports[0];
  ports.add(port);
  port.start();
  if (!stream) return start();
  if (!open) return;
  send(port, { kind: 'open' });
  for (const ev of log) send(port, { kind: 'event', ev: ev.type === 'status' ? ev : { ...ev, replay: true } });
};

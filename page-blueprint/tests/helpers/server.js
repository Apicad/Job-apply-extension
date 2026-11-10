// A throwaway web server for test pages. Each server has its own port, so two of them give
// two different origins, which is what cross-site frame tests need.

import http from 'node:http';

export async function startServer() {
  const pages = new Map(); // pathname -> html
  const redirects = new Map(); // pathname -> address to send the browser on to
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (redirects.has(pathname)) {
      response.writeHead(302, { location: redirects.get(pathname) }).end();
      return;
    }
    const html = pages.get(pathname);
    if (html === undefined) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let served = 0;

  return {
    origin,

    /** Serves `html` at a fresh address and returns that address. */
    serve(html, name = `page-${++served}.html`) {
      pages.set(`/${name}`, html);
      return `${origin}/${name}`;
    },

    /** Makes `name` redirect to `target` and returns the address that redirects. */
    redirect(name, target) {
      redirects.set(`/${name}`, target);
      return `${origin}/${name}`;
    },

    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

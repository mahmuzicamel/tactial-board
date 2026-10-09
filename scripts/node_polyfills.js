// Polyfill FileReader in Node.js
class PolyfillFileReader {
  readAsArrayBuffer(blob) {
    const doRead = async () => {
      try {
        let buf;
        if (blob.arrayBuffer) {
          buf = await blob.arrayBuffer();
        } else {
          buf = await new Response(blob).arrayBuffer();
        }
        this.result = buf;
        if (this.onloadend) this.onloadend();
        if (this.onload) this.onload({ target: this });
      } catch (err) {
        if (this.onerror) this.onerror(err);
      }
    };
    setTimeout(doRead, 0);
  }

  readAsDataURL(blob) {
    const doRead = async () => {
      try {
        let buf;
        if (blob.arrayBuffer) {
          buf = await blob.arrayBuffer();
        } else {
          buf = await new Response(blob).arrayBuffer();
        }
        const base64 = Buffer.from(buf).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
        if (this.onloadend) this.onloadend();
        if (this.onload) this.onload({ target: this });
      } catch (err) {
        if (this.onerror) this.onerror(err);
      }
    };
    setTimeout(doRead, 0);
  }
}
global.FileReader = PolyfillFileReader;
global.window.FileReader = PolyfillFileReader;

// Minimal HTMLCanvasElement / Image polyfills if needed
if (!global.document) {
  global.document = {
    createElement: () => ({ getContext: () => null })
  };
}

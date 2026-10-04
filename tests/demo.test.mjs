import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";

const demo = await readFile(new URL("../tools/demo.html", import.meta.url), "utf8");
test("demo inline scripts parse and only advertise current tools", () => {
  for (const [, script] of demo.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script);
  assert.match(demo, /data-try="annotate"/);
  assert.match(demo, /data-try="camera"/);
  assert.match(demo, /data-try="browse"/);
  assert.doesNotMatch(demo, /data-try="(?:wand|note|markup|settings)"/);
  assert.match(demo, /Real screenshot exports need the Chrome extension/);
  assert.match(demo, /preload="none"/);
  assert.doesNotMatch(demo, /<video[^>]*autoplay/);
});

test("all local demo assets and preview source exist", async () => {
  for (const [, reference] of demo.matchAll(/(?:src|poster)="(\.\.\/[^"?]+)"/g)) {
    await access(new URL(`../tools/${reference}`, import.meta.url));
  }
  await access(new URL("../content/content.js", import.meta.url));
  await access(new URL("../content/content.css", import.meta.url));
});

function jpegSize(buffer) {
  assert.equal(buffer.readUInt16BE(0), 0xffd8);
  let cursor = 2;
  while (cursor < buffer.length) {
    assert.equal(buffer[cursor++], 0xff);
    const marker = buffer[cursor++];
    const length = buffer.readUInt16BE(cursor);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return [buffer.readUInt16BE(cursor + 5), buffer.readUInt16BE(cursor + 3)];
    cursor += length;
  }
  throw new Error("No JPEG dimensions found");
}

test("current listing images have required JPEG canvas sizes", async () => {
  for (const name of ["01-annotate-1280x800.jpg", "02-controls-1280x800.jpg", "03-camera-1280x800.jpg"])
    assert.deepEqual(jpegSize(await readFile(new URL(`../store-assets/0.2.0/${name}`, import.meta.url))), [1280, 800]);
  assert.deepEqual(jpegSize(await readFile(new URL("../store-assets/0.2.0/small-promo-440x280.jpg", import.meta.url))), [440, 280]);
});

test("animated promo assets are present and use expected file formats", async () => {
  const gif = await readFile(new URL("../store-assets/0.2.0/glassy-reveal.gif", import.meta.url));
  assert.equal(gif.toString("ascii", 0, 6), "GIF89a");
  assert.ok(gif.includes(Buffer.from("NETSCAPE2.0")), "GIF should loop");
  const video = await readFile(new URL("../store-assets/0.2.0/glassy-walkthrough.mp4", import.meta.url));
  assert.equal(video.toString("ascii", 4, 8), "ftyp");
  assert.ok(video.indexOf(Buffer.from("moov")) < video.indexOf(Buffer.from("mdat")), "video metadata should support progressive playback");
});

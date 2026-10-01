export default async function verifyLayout(page) {
  const results = [];
  const main = page.locator(".gfx-pill"), alt = page.locator(".gfx-alternate"), opts = page.locator(".gfx-options");
  const assert = (condition, name) => { if (!condition) throw new Error(name); results.push(name); };
  const settle = async () => { await page.mouse.move(180, 600); await page.waitForTimeout(400); };
  const inside = async (width, height, name) => {
    await page.waitForTimeout(300);
    for (const node of [main, alt, opts]) {
      const r = await node.boundingBox();
      assert(r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height,
        name + " " + await node.getAttribute("class"));
    }
    const a = await main.boundingBox(), b = await opts.boundingBox();
    assert(b.x + b.width <= a.x || b.x >= a.x + a.width ||
      b.y + b.height <= a.y || b.y >= a.y + a.height, name + " options do not overlap main");
  };
  const moveMain = async (x, y) => {
    await settle();
    const r = await main.boundingBox();
    await page.mouse.move(r.x + 28, r.y + 28);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
    await settle();
  };
  await page.setViewportSize({ width: 1280, height: 800 });
  await moveMain(600, 360);
  for (const direction of ["left", "right", "up", "down"]) {
    const r = await main.boundingBox(), c = { x: r.x + 28, y: r.y + 28 };
    const d = { left: [-40, 0], right: [40, 0], up: [0, -40], down: [0, 40] }[direction];
    await page.mouse.move(c.x + d[0], c.y + d[1]);
    await page.mouse.move(c.x + d[0] * .65, c.y + d[1] * .65);
    await opts.waitFor({ state: "visible" });
    const a = await alt.boundingBox();
    assert(direction === "left" ? a.x < r.x : direction === "right" ? a.x > r.x :
      direction === "up" ? a.y < r.y : a.y > r.y, "entry direction " + direction);
    await inside(1280, 800, direction);
    await settle();
  }
  for (const corner of [[30, 30], [1250, 30], [30, 760], [1250, 760]]) {
    await moveMain(...corner);
    await main.hover();
    await opts.waitFor({ state: "visible" });
    await inside(1280, 800, "corner " + corner.join(","));
  }
  await page.setViewportSize({ width: 360, height: 640 });
  await main.hover();
  await opts.waitFor({ state: "visible" });
  await inside(360, 640, "narrow camera");
  await alt.hover();
  await page.waitForTimeout(550);
  await inside(360, 640, "narrow annotation");
  await page.screenshot({ path: "output/playwright/v02-narrow.png" });
  await page.setViewportSize({ width: 1280, height: 800 });
  return results;
}

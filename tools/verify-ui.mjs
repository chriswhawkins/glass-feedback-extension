// Run against tools/fixture.html with the unpacked extension enabled.
// Pass a Playwright Page; no test framework or runtime dependency is required.
export default async function verifyUI(page) {
  const checked = [];
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    checked.push(name);
  };
  const primary = page.locator(".gfx-pill");
  const alternate = page.locator(".gfx-alternate");
  const options = page.locator(".gfx-options");
  const option = (name) => options.getByRole("button", { name, exact: true });
  const box = async (node) => node.boundingBox();
  const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const moveTo = async (node) => {
    const p = center(await box(node));
    await page.mouse.move(p.x, p.y);
  };
  const hoverMain = async () => {
    await moveTo(primary);
    await page.waitForTimeout(560);
  };
  const chooseAnnotation = async (name) => {
    await hoverMain();
    if ((await primary.getAttribute("aria-label")).startsWith("Capture")) {
      await moveTo(alternate);
      await page.waitForTimeout(300);
    }
    await option(name).click();
  };
  const chooseCamera = async (name) => {
    await hoverMain();
    if ((await primary.getAttribute("aria-label")).startsWith("Annotate")) {
      await moveTo(alternate);
      await page.waitForTimeout(300);
    }
    await option(name).click();
  };
  await primary.waitFor();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(80);
  check(await primary.getAttribute("aria-label") === "Capture selection to clipboard", "initial selection/copy defaults");
  await primary.click();
  await page.mouse.move(120, 240);
  await page.mouse.down();
  await page.mouse.move(820, 550, { steps: 10 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Capture selected region", exact: true }).click();
  await page.waitForFunction(() => {
    const text = document.getElementById("gfx-host").shadowRoot.querySelector(".gfx-toast").textContent;
    return text === "Copied to clipboard" || text === "Clipboard blocked — saved to downloads" || text.startsWith("Capture failed:");
  });
  check(await page.locator(".gfx-toast").textContent() === "Copied to clipboard", "selection copies through the real Chrome clipboard");
  await page.mouse.move(100, 100);
  await page.waitForTimeout(400);
  const r = await box(primary);
  await page.mouse.move(r.x - 20, r.y + 28);
  await page.mouse.move(r.x + 2, r.y + 28);
  await page.waitForTimeout(80);
  check(!await alternate.isVisible(), "hover has a deliberate delay");
  await options.waitFor({ state: "visible", timeout: 3000 });
  check(await alternate.isVisible() && await options.isVisible(), "primary hover exposes modes and options");
  await moveTo(alternate);
  await page.waitForTimeout(300);
  check(await options.getAttribute("data-mode") === "annotate", "hover previews annotation without switching");
  await option("Add notes").click();
  await page.mouse.click(200, 280);
  await page.keyboard.type("Keep this detail clear.");
  await page.mouse.click(580, 350);
  await page.keyboard.type("A second independent note.");
  const notes = page.locator(".gfx-note");
  check(await notes.count() === 2, "multiple notes remain in annotation mode");
  await page.mouse.click(900, 350);
  await notes.last().getByRole("button", { name: "Delete note" }).click();
  check(await notes.count() === 2, "delete removes only the selected note");
  await notes.first().getByRole("button", { name: "Flip note theme" }).click();
  check((await notes.first().getAttribute("class")).includes("gfx-note-light"), "individual note theme");
  await notes.first().getByRole("slider", { name: "Note opacity" }).fill("55");
  check(await notes.first().evaluate((node) => node.style.getPropertyValue("--note-opacity")) === "0.55", "individual note opacity");
  const before = await box(notes.first());
  await page.setViewportSize({ width: 1000, height: 700 });
  const resized = await box(notes.first());
  check(Math.abs(before.x - resized.x) < 2 && Math.abs(before.y - resized.y) < 2, "resize retains document anchors");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => window.scrollTo({ top: 220, behavior: "instant" }));
  await page.waitForTimeout(80);
  const after = await box(notes.first());
  check(Math.abs(before.y - after.y - 220) < 2, "notes retain document anchors while scrolling");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(80);
  await chooseAnnotation("Draw");
  await page.mouse.move(400, 480);
  await page.mouse.down();
  await page.mouse.move(540, 520, { steps: 12 });
  await page.mouse.up();
  check(await page.locator(".gfx-drawings path").count() === 1, "freehand stroke created");
  const drawnBefore = await box(page.locator(".gfx-drawings path"));
  await page.evaluate(() => window.scrollTo({ top: 180, behavior: "instant" }));
  await page.waitForTimeout(80);
  const drawnAfter = await box(page.locator(".gfx-drawings path"));
  check(Math.abs(drawnBefore.y - drawnAfter.y - 180) < 2, "drawings retain document anchors while scrolling");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await chooseAnnotation("Erase drawing");
  await page.mouse.click(470, 500);
  check(await page.locator(".gfx-drawings path").count() === 0, "eraser removes selected stroke");
  await chooseAnnotation("Draw");
  await page.mouse.move(400, 480);
  await page.mouse.down();
  await page.mouse.move(540, 520, { steps: 12 });
  await page.mouse.up();
  await hoverMain();
  await option("Undo last drawing").click();
  check(await page.locator(".gfx-drawings path").count() === 0, "undo removes the last stroke");
  await page.keyboard.press("Escape");
  check(!(await page.locator(".gfx-place-layer").isVisible()), "Escape leaves annotation mode");
  await primary.click();
  await page.mouse.move(120, 240);
  await page.mouse.down();
  await page.mouse.move(820, 550, { steps: 10 });
  await page.mouse.up();
  check(await page.getByRole("button", { name: "Capture selected region", exact: true }).isVisible(), "selection exposes an explicit capture action");
  await page.keyboard.press("Escape");
  await chooseCamera("Save to downloads");
  await chooseCamera("Full page");
  const menuBox = await box(options), primaryBox = await box(primary);
  check(menuBox.x + menuBox.width <= primaryBox.x || menuBox.x >= primaryBox.x + primaryBox.width ||
    menuBox.y + menuBox.height <= primaryBox.y || menuBox.y >= primaryBox.y + primaryBox.height,
    "animated flyout does not overlap the primary action");
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: "instant" }));
  await page.waitForTimeout(80);
  await primary.click();
  await page.waitForFunction(() => {
    const root = document.getElementById("gfx-host").shadowRoot;
    return root.querySelector(".gfx-toast").textContent === "Saved to downloads" ||
      root.querySelector(".gfx-toast").textContent.startsWith("Capture failed:");
  }, null, { timeout: 20000 });
  check(await page.locator(".gfx-toast").textContent() === "Saved to downloads", "full-page export succeeds");
  check(await page.evaluate(() => Math.abs(window.scrollY - 200) < 2), "capture restores original scroll position");
  check(await primary.isVisible() && !await primary.isDisabled(), "capture restores usable controls");
  await page.screenshot({ path: "output/playwright/v02-annotations.png" });
  await page.reload();
  // Activation is on demand; the native Chrome action must be clicked after reload.
  await page.evaluate((results) => { window.__verification = results; }, checked);
  return checked;
}

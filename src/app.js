import { chromium } from "playwright";
import { expect } from "@playwright/test";

const testScript = async () => {
  // 1. Launch the browser
  // Change channel to 'chromium' or remove it entirely to use Playwright's stock browser
  const browser = await chromium.launch({
    headless: false, // Set to true if you don't want the browser GUI to open
    channel: "chrome", // Forces Playwright to use your locally installed Google Chrome application
  });
  try {
    // 2. Create a clean browser context (isolated session)
    const context = await browser.newContext();

    // 3. Open a new tab/page
    const page = await context.newPage();

    // 4. Navigate to your target website
    await page.goto("https://www.google.com/maps");

    await page.fill('input[name="q"]', "dentist in islamabad");
    await page.keyboard.press("Enter");

    const feed = page.getByRole("feed");

    await expect(feed.getByRole("article").first()).toBeVisible({
      timeout: 15000,
    });


    const MAX_RESULTS = 25;
    let previousCount = 0;

    while (true) {
      const currentCount = await feed.getByRole("article").count();

      if (currentCount >= MAX_RESULTS) {
        previousCount = MAX_RESULTS;
        break;
      }

      await feed.hover();
      await page.mouse.wheel(0, 3000);

      const newElementAppeared = await feed
        .getByRole("article")
        .nth(currentCount)
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false);

      const newCount = await feed.getByRole("article").count();
      previousCount = Math.min(newCount, MAX_RESULTS);

      if (!newElementAppeared || newCount === currentCount) {
        break;
      }
    }

    const results = feed.getByRole("article");
    const count = previousCount;
    console.log("Number of results found:", count);

    for (let i = 0; i < count; i++) {
      const firstLink = results.nth(i).getByRole("link").first();
      const name = await firstLink.getAttribute("aria-label");
      if (name) {
        console.log(`Business Name ${i + 1}:`, name);
      }
    }

    // const businessName = await firstResult.getAttribute('aria-label');
    // console.log("Business Name from aria-label:", businessName);

    // 5. Clean up and close everything
    await browser.close();
  } catch (error) {
    console.error("Error during script execution:", error);
    await browser.close();
  }
};

testScript();

import { chromium } from "playwright";
import { expect } from "@playwright/test";
import fs from "fs";

const input = JSON.parse(fs.readFileSync("./src/input.json", "utf-8"));

const searchQuery = input.searchQuery;
const MAX_RESULTS = input.maxResults;
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

    await page.fill('input[name="q"]', searchQuery);
    await page.keyboard.press("Enter");

    const feed = page.getByRole("feed");

    await expect(feed.getByRole("article").first()).toBeVisible({
      timeout: 15000,
    });


    // Step 1: Scroll to load results (yeh already sahi hai, waise hi rakhein)
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

    const count = previousCount;
    console.log("Number of results found:", count);

    // Step 2: Basic info nikalna (bina click kiye)
    const allResults = [];

    for (let i = 0; i < count; i++) {
      const results = feed.getByRole("article");
      const firstLink = results.nth(i).getByRole("link").first();
      const name = await firstLink.getAttribute("aria-label");
      const placeUrl = await firstLink.getAttribute('href');

      const fullText = await results.nth(i).innerText();
      const lines = fullText.split('\n').filter(line => line.trim() !== '');

      const ratingLine = lines.find(line => /^\d\.\d\(/.test(line));
      const rating = ratingLine ? ratingLine.split('(')[0] : null;
      const reviewCount = ratingLine ? ratingLine.match(/\((\d+)\)/)?.[1] : null;

      const categoryAddressLine = lines.find(line => line.includes('·') && !line.includes('Open') && !line.includes('Closed'));
      const parts = categoryAddressLine
        ? categoryAddressLine.split('·').map(p => p.trim()).filter(p => p !== '')
        : [];
      const category = parts[0] || null;

      const statusLine = lines.find(line => line.includes('Open') || line.includes('Closed'));


      allResults.push({ name, rating, reviewCount, category, address: null, statusLine, placeUrl, phoneNumber: null, websiteUrl: null });

    }
    const uniqueResults = Array.from(
      new Map(allResults.map(item => [item.placeUrl, item])).values()
    );


    // Step 3: Har business ko click karke phone/website nikalna
    let prevPhone = null;
    let prevWebsite = null;

    for (let i = 0; i < count; i++) {
      try {
        await page.goto(uniqueResults[i].placeUrl);

        const phoneButton = page.getByRole('button', { name: /^Phone:/ });
        const phoneLabel = await phoneButton.getAttribute('aria-label').catch(() => null);
        uniqueResults[i].phoneNumber = phoneLabel ? phoneLabel.replace('Phone: ', '') : null;

        const websiteLink = page.getByRole('link', { name: /^Website:/ });
        uniqueResults[i].websiteUrl = await websiteLink.getAttribute('href').catch(() => null);

        const addressButton = page.getByRole('button', { name: /^Address:/ });
        const addressLabel = await addressButton.getAttribute('aria-label').catch(() => null);
        uniqueResults[i].address = addressLabel ? addressLabel.replace('Address: ', '') : uniqueResults[i].address;

      } catch (error) {
        console.log(`Warning: result ${i} (${uniqueResults[i].name})'s details could not be extracted:`, error.message);
      }
    }



    for (const result of uniqueResults) {
      delete result.placeUrl;
    }

    console.log(JSON.stringify(uniqueResults, null, 2));


    await browser.close();
    fs.mkdirSync('output', { recursive: true });
    fs.writeFileSync('output/results.json', JSON.stringify(uniqueResults, null, 2));
    console.log(`Data saved to output/results.json (${uniqueResults.length} records)`);
  } catch (error) {
    console.error("Error during script execution:", error);
    await browser.close();
  }
};

testScript();

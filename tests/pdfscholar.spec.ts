import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('PDF Scholar', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/PDF Scholar/);
    await expect(page.locator('h1')).toContainText('PDF Scholar');
  });

  test('should show upload interface', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Upload a PDF to start learning')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test('should upload and display PDF', async ({ page }) => {
    await page.goto('/');
    
    // Create a test PDF file path
    const testPdfPath = path.join(__dirname, 'test.pdf');
    
    // Upload the file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);
    
    // Wait for PDF viewer to appear
    await expect(page.locator('.react-pdf__Document')).toBeVisible({ timeout: 10000 });
    
    // Check that the Analyze button is visible
    await expect(page.locator('button:has-text("Analyze")')).toBeVisible();
  });

  test('should show chat interface', async ({ page }) => {
    await page.goto('/');
    
    // Upload a PDF first
    const fileInput = page.locator('input[type="file"]');
    const testPdfPath = path.join(__dirname, 'test.pdf');
    await fileInput.setInputFiles(testPdfPath);
    
    // Wait for the layout to load
    await page.waitForSelector('.react-pdf__Document', { timeout: 10000 });
    
    // Check chat interface elements
    await expect(page.locator('text=AI Tutor')).toBeVisible();
    await expect(page.locator('text=No messages yet')).toBeVisible();
  });

  test('should respond to keyboard shortcut', async ({ page }) => {
    await page.goto('/');
    
    // Upload a PDF
    const fileInput = page.locator('input[type="file"]');
    const testPdfPath = path.join(__dirname, 'test.pdf');
    await fileInput.setInputFiles(testPdfPath);
    
    // Wait for PDF to load
    await page.waitForSelector('.react-pdf__Document', { timeout: 10000 });
    
    // Press 'A' key
    await page.keyboard.press('a');
    
    // Check if analyze was triggered (button should show "Analyzing...")
    await expect(page.locator('button:has-text("Analyzing...")')).toBeVisible();
  });

  test('should maintain panel resize', async ({ page }) => {
    await page.goto('/');
    
    // Upload a PDF
    const fileInput = page.locator('input[type="file"]');
    const testPdfPath = path.join(__dirname, 'test.pdf');
    await fileInput.setInputFiles(testPdfPath);
    
    // Wait for panels to load
    await page.waitForSelector('[data-panel-resize-handle-enabled]', { timeout: 10000 });
    
    // Get initial panel sizes
    const panels = await page.locator('[data-panel]').all();
    expect(panels).toHaveLength(2);
    
    // Drag the resize handle
    const resizeHandle = page.locator('[data-panel-resize-handle-enabled]');
    await resizeHandle.hover();
    await page.mouse.down();
    await page.mouse.move(100, 0);
    await page.mouse.up();
    
    // Reload page
    await page.reload();
    
    // Check that panel sizes are maintained (localStorage)
    const savedSizes = await page.evaluate(() => {
      return localStorage.getItem('pdfscholar-panel-sizes');
    });
    expect(savedSizes).toBeTruthy();
  });
});

test.describe('API Health Check', () => {
  test('should return health status', async ({ request }) => {
    const response = await request.get('/api/chat');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('model');
    expect(data).toHaveProperty('contextLength');
  });
});
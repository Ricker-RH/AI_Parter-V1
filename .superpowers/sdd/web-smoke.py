from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path('/Users/luoruihao/Documents/ChatGPT/AI parter V1.0/.worktrees/aifans-foundation')
shots = root / '.superpowers' / 'sdd' / 'screenshots'
shots.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    desktop = browser.new_page(viewport={"width": 1440, "height": 1000}, color_scheme="light")
    errors = []
    desktop.on("pageerror", lambda error: errors.append(str(error)))
    desktop.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    results = []
    for path, name in [('/zh-CN', 'home-zh'), ('/zh-CN/admin', 'admin-zh'), ('/zh-CN/messages', 'messages-zh')]:
        response = desktop.goto(f'http://127.0.0.1:3300{path}', wait_until='networkidle')
        desktop.screenshot(path=str(shots / f'{name}.png'), full_page=True)
        results.append((path, response.status if response else None, desktop.title(), desktop.locator('body').inner_text()[:240]))

    mobile = browser.new_page(viewport={"width": 390, "height": 844}, color_scheme="dark")
    response = mobile.goto('http://127.0.0.1:3300/en', wait_until='networkidle')
    mobile.screenshot(path=str(shots / 'home-en-mobile-dark.png'), full_page=True)
    results.append(('/en mobile dark', response.status if response else None, mobile.title(), mobile.locator('body').inner_text()[:240]))
    print({"pages": results, "browser_errors": errors})
    browser.close()
